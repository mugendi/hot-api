var restify = require('restify');
var _ = require('lodash');
var path = require('path');

var bunyan = require('bunyan');
var bformat = require('bunyan-format') ;

var fs = require('fs');
var clearRequire = require('clear-require');
var semver = require('semver');
var chokidar = require('chokidar');

var util = require('util');
var arrify = require('arrify');
var chalk = require('chalk');


var neededOptions = [ 'apiDir' ];

var apiOptions = {};
var apiRoutes = {};
var apiServer = {};

var bunyanLogger = {};

module.exports = {
  initialize : initialize
}

function initialize(routeFile){

  //ensure we have all needed values
  var diff = _.difference(neededOptions , _.keys(this.options));

  //if Missing Parameters
  if( !diff.length ){
    //load routes on startup
    //use fs.statSync to throw error if path does not exist
    if(  !( stat = fs.statSync( this.options.apiDir ) ) || !stat.isDirectory() ){
      var error = new Error( util.format("% does not exist or is not a Directory.", this.options.apiDir));
      logErrorExit(error);
    }

  }
  else{
    var error = new Error(
      util.format("All required options not entered. Please complete the following options: %s", util.inspect(diff))
    );

    logErrorExit(error);
  }

  /*
    Loggers setting...
   */
  mkdirP(this.options.apiLogDir);

  bunyanLogger = bunyan.createLogger({
    name: this.options.apiName,
    streams: [
       {
         stream: bformat({ outputMode: 'short' }),
         level: 'debug'
       },
       {
         path: path.join( this.options.apiLogDir, this.options.apiName.replace(/[^a-z0-9]/ig,'_') + '.log') ,
         level: 'trace'
       }
     ],
     serializers: restify.bunyan.serializers

  });


  //set logger
  this.options.apiServerOpts.log = bunyanLogger ;

  apiOptions = this.options;

  //start server
  apiServer = restify.createServer(apiOptions.apiServerOpts);

  //set process name
  process.title = apiOptions.apiName ;


  return {
    restify : restify,
    server : apiServer,
    start : start
  }

}


function start(pluginsArr){

  logLined( 'gray', "AHEM! WE'RE LAUNCHING. BELT UP!" );

  //start listening
  apiServer.listen( apiOptions.apiPort, function() {

    logLined( 'green', util.format( "%s: NOW LISTENING AT %s", chalk.bold(process.title) ,chalk.bold( apiServer.url) ));

    //plugins
    // set server plugins
    logLined( 'blue', "SETTING PLUGINS..." );

    _.each(arrify(pluginsArr), function(plugin){
      log(chalk.blue( util.format("Plugin: %s set." , chalk.bold(plugin.name) )));
      apiServer.use(plugin);
    });

    //make routes
    makeRoutes();

  });

}


function makeRoutes(){

  //if verbose level for pre & post call loggers
  if(apiOptions.apiVerbosity){

    //pre logger...
    apiServer.pre(function (req, res, next) {
      //different verbosities
      switch (apiOptions.apiVerbosity) {
        case 1:
          var r = {route: req.url};
          break;
        default:
          var r ={req: req};
      }

      req.log.info(r, "start");
      req.start = Date.now();

      return next();
    });

    //
    apiServer.on('after', function (req, res, route) {
      // console.log('two')
      //different verbosities
      switch (apiOptions.apiVerbosity) {
        case 1:
          var r = {route: req.url};
          break;
        default:
          var r ={res: res};
      }

      req.end = Date.now();
      req.duration = req.end - req.end;

      // console.log('')
      req.log.info(r, util.format("Finished in %d ms " , req.duration) );

    });


  }

  //load routes via chokidar
  var chokidarOpts = {
    // ignored: /[\/\\]\./,
    persistent: true,
    followSymlinks: true,
    depth: 1
  };

  var watchDirs = arrify(apiOptions.apiDir);

  logLined( 'gray', "WATCHING API ROUTES ON: " + chalk.bold(watchDirs) );

  // One-liner for current directory, ignores .dotfiles
  var watcher = chokidar.watch(watchDirs  , chokidarOpts)
    .on('all', loadScript)
    .on('ready', function(){
      // console.log('ready');
      // var versionFolders = _.values(watcher._watched)[1].children();
      // console.log(versionFolders);
    });

}

var skipPaths = {};
var glob = require("glob")

function loadScript( evt, filePath, stat){
  var versionDir = path.dirname(filePath);
  
  //if skip files
  //
  if( path.basename(filePath) =='.skip' ){

    var firstLoad = _.size(skipPaths) ? false : true;

    //skipPaths
    skipPaths[versionDir] = (evt == 'add') ? true : false;

    if(!firstLoad){
      // loop thru the files
      glob(path.join(versionDir,"*.js"), {}, function (er, files) {
        // load scripts...
        _.each(files, function(file){
          loadScript( evt, path.normalize(file), stat)
        });
      });
    }

    // console.log(skipPaths, evt);
  }

  //if JS file & not skip paths
  if( path.extname(filePath) =='.js' ){

    logLined( 'magenta', "LOADING ROUTE FILE: " + path.basename(filePath) );

    var version = path.dirname( path.relative( apiOptions.apiDir, filePath ) );
    // var isSemver = !(semver.valid(version) === null);

    //Load Route File
    try{
      var RF = _.clone( require(filePath) );
      //to enable updates on reload, we must clear this require
      clearRequire(filePath);
    }
    catch(e){
      console.log('');
      bunyanLogger.error(e);
      console.log('');
    }

    var MIDDLEWARE = {
      before : [],
      after : []
    };

    //load global middleware
    if(_.has(RF,'$GLOBALS$')){
      //GLOBALS
      var GLOBALS = RF['$GLOBALS$'];

      //remove special $GLOBALS$ key
      delete RF['$GLOBALS$'];

      MIDDLEWARE.before = _.union( MIDDLEWARE.before,  arrify( _.values(GLOBALS.middleware.before) ) );
      MIDDLEWARE.after = _.union(MIDDLEWARE.after,  arrify( _.values(GLOBALS.middleware.after) ));

    }

    //loop thru the exported object of methods
    _.each(RF, function(routeData, route){

      if(_.has(routeData,'middleware')){
        MIDDLEWARE.before = _.union(MIDDLEWARE.before,  arrify( _.values(routeData.middleware.before) ));
        MIDDLEWARE.after = _.union(MIDDLEWARE.after,  arrify( _.values(routeData.middleware.after) ));
      }

      // console.log(MIDDLEWARE);

      _.each(routeData.methods, function( func, method ){

        var ROUTE = {
          path : util.format('/%s/%s', version, route ).replace(/\/{2,}/,'/'),
          name: routeName
        };

        //for semver routes...
        if(semver.valid(version) !== null ){
          ROUTE = {
            path:route, version:version
          }
        }

        //
        var routeName = JSON.stringify(route);

        //remove route if exists
        if( apiRoutes.hasOwnProperty( routeName ) ){
          var unmounted = apiServer.rm( apiRoutes[routeName] );
          log( chalk.gray( util.format("Unmounting the route %s...", chalk.bold( ROUTE.path ) )) , 1 );
        }

        //add route to routes folder...
        //Dont add router if skip files
        if( !_.has(skipPaths,versionDir) || skipPaths[versionDir] === false   ){
          // console.log('load')
          log( chalk.magenta( util.format("Route %s initialized...", chalk.bold( ROUTE.path ) )) );
          //mount route
          apiRoutes[routeName] = apiServer[method](ROUTE , MIDDLEWARE.before, func , MIDDLEWARE.after  );
        }
        else{
          log( chalk.blue( util.format("Skip File detected...skipping loads...")) );
        }

      });

    });

  }

}


//Some log beautification. Nothing too fancy!
function logLined(color,msg){
  color = color || 'gray';
  msg = msg || ' ';

  var chars = 70;
  var l = _.repeat("-", chars);
  var pad = Math.abs((chars - msg.length)/2);

  // console.log( chalk[color]("\n" + l) );
  console.log("\n");
  console.log( chalk[color]( msg ) );
  console.log( chalk[color]( l + "") );

}

function log(msg, t){
  // var pad = Math.abs((chars - msg.length)/2);
  var pad = 1;
  console.log( (t?"  ":"") +  _.repeat(' ', pad ) + chalk.gray("~ ") + msg );
}


mkdirP = function(dirPath, mode, callback) {
  //Call the standard fs.mkdir
  fs.mkdir(dirPath, mode, function(error) {
    //When it fail in this way, do the custom steps
    if (error && error.errno === 34) {
      //Create all the parents recursively
      fs.mkdirP(path.dirname(dirPath), mode, callback);
      //And then the directory
      fs.mkdirP(dirPath, mode, callback);
    }
    //Manually run the callback since we used our own callback to do all these
    callback && callback(error);
  });
};

/**
 * [logErrorExit description]
 * @param  {[type]} error [description]
 */
function logErrorExit(error) {
  bunyanLogger.info(error);
  process.exit(1);
}
