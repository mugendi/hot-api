var restify = require('restify');
var _ = require('lodash');
var path = require('path');
var glob = require("glob");

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
var apiFiles = {};
var apiReloads = {};
var apiServer = {};

var bunyanLogger = {};

//
var skipPaths = {};
var skipDirs = {};
var EXPORTS = { routes : {} };


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

    _.each(_.compact( arrify(pluginsArr)), function(plugin){
      log(chalk.magenta( util.format("Plugin: %s set." , chalk.bold(plugin.name || '~ Unknown') )));
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
          var r = { route : decodeURIComponent(req.url) };
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
          var r = { route : decodeURIComponent( req.url ) };
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

  var watchDirs = arrify(apiOptions.apiDir);

  logLined( 'gray', "WATCHING API ROUTES ON: " + chalk.bold(watchDirs) );

  _(watchDirs).each(dir => {
    //
    _.each( glob.sync( path.join(dir,'*',".skip") ), p => {
      skipDirs[ path.resolve(path.dirname(p)) ] = true;
    });

  });

  // if(skipDirs){ unloadScripts( _.keys(skipDirs) ); }

  //
  var chokidarOpts = {
    // ignored: /[\/\\]\./,
    persistent: true,
    followSymlinks: true,
    depth: 1
  };


  // One-liner for current directory, ignores .dotfiles
  var watcher = chokidar.watch(watchDirs  , chokidarOpts)
    .on('all', function(evt, filePath, stat){
      //
      if( (stat && !stat.isDirectory()) || ( path.extname(filePath) == '.js' || path.basename(filePath)=='.skip' ) ){
        loadScript( evt, filePath, stat );
      }

    })
    .on('ready', function(){
      // console.log('ready');
      // var versionFolders = _.values(watcher._watched)[1].children();
      // console.log(versionFolders);
    });

}

function unloadScripts(dirs){
  dirs = arrify(dirs);
  //thru each directory
  _.each(dirs, dir => {
    //unloadScript on each .js file
    _.each(
      glob.sync( path.join(dir,'*.js') ),
      filePath => unloadScript( path.resolve(filePath) ) )
  });

}

function unloadScript(filePath){

  if(apiFiles[filePath]){
    var thisDirectory = path.sep + path.dirname( filePath ).split(path.sep).pop();

    logLined( 'white', util.format("UNLOADING ROUTE FILE: %s ", path.join( thisDirectory , path.basename(filePath) ) ) );

    if(apiFiles[filePath].routes.length===0){
      log( chalk.gray( "No routes to unmount..." ));
    }

    _.each(apiFiles[filePath].routes, (obj,index) => {
      unmountRoute(obj.name, filePath);
    });

    //delete from object...
    delete apiFiles[filePath];

  }

}

function unmountRoute(name, filePath){

  //attempt to unmount path
  if( ( name = apiServer.rm(name) ) ){
    var i =  _.indexOf( _.map(apiFiles[filePath].routes, 'name' ), name );
    var obj = apiFiles[filePath].routes[i];
    //log
    log( chalk.grey( util.format("Route %s - (%s) unmounted...", chalk.bold( obj.path ), name  )));
    //delete route from apiFiles
    delete apiFiles[filePath].routes[i];
  }

}

/**/
function loadScript( evt, filePath, stat){
  var versionDir = path.dirname(filePath);


  if( path.basename(filePath) == '.skip'  ){

    //if SKIP file is removed
    if( evt == 'unlink' ){
      //remove from skipDirs
      delete skipDirs[versionDir];

      //loadScripts
      _.each( glob.sync( path.join(versionDir,'*.js') ), filePath => {
        // console.log(filePath)
        loadScript('add', path.resolve(filePath), fs.statSync(filePath) );
      });

    }
    else{
      // files = glob.sync(path.join(path.driname(filePath)),'');
      unloadScripts([path.dirname(filePath)]);
      //add to skipDirs
      skipDirs[versionDir] = true;
    }

  }

  //if JS file & not skip paths
  if( path.extname(filePath) =='.js' && !skipDirs[versionDir] ){

    //unloadScript
    if(evt == 'unlink'){
      //unloadScript
      unloadScript(filePath);

    }
    else{

      var routeFile = routeFileData(filePath);

      //now load actual paths
      _.each(routeFile.routes, (obj, index) => {
        // console.log(obj,index);

        //unmount route if existing
        if(apiFiles[filePath] && apiFiles[filePath].routes && apiFiles[filePath].routes[obj.name] ){
          unmountRoute(obj.name, filePath);
        }

        //unmount route if existing
        if(apiFiles[filePath]){
          var i =  _.indexOf( _.map(apiFiles[filePath].routes, 'name' ), name );
          var n = apiFiles[filePath].routes[i].name;
          unmountRoute(n, filePath);
        }

        //create route & update name
        if( (name = apiServer[obj.method] ( _.pick(obj,'path','name') , obj.middleware.before, obj.func , obj.middleware.after )) && name ){
          routeFile.routes[index].name = name;

          //log
          log( chalk.magenta( util.format("Route %s - (%s) mounted...", chalk.bold( obj.path ), routeFile.routes[index].name  )));

        }
        else{
          //remove file
          delete routeFile.routes[index];
        }

      });

      //compact
      routeFile.routes = _.compact(routeFile.routes);

      if(routeFile.routes.length===0){
        log( chalk.magenta( "No routes to mount..." ));
      }

      //add to object...
      apiFiles[filePath] = _.merge({},routeFile);
      apiReloads[filePath] = ( apiReloads[filePath] || 1 )+1;
      // console.log(JSON.stringify(routeFile,0,4));
    }

  }

}

function routeFileData(filePath, cb){
  var versionDir = path.dirname(filePath);
  var version = path.dirname( path.relative( apiOptions.apiDir, filePath ) );
  var thisRoutes = [];
  var thisDirectory = path.sep + path.dirname( filePath ).split(path.sep).pop();
  var routeFile = {this:{}} ;
  // var isSemver = !(semver.valid(version) === null);
  // console.log(thisDirectory, path.sep, path.dirname(filePath))

  //Load Route File
  try{

    if( fs.existsSync(filePath) ){
      routeFile = require(filePath) ;
      logLined( 'blue', util.format("LOADING ROUTE FILE: %s - [%d reloads]", path.join( thisDirectory , path.basename(filePath) ) , apiReloads[filePath] || 1 ) );
      //to enable updates on reload, we must clear this require
      clearRequire(filePath);
    }

  }
  catch(e){
    logLined( 'red', util.format("ERROR LOADING ROUTE FILE: %s", path.join( thisDirectory , path.basename(filePath) )));
    bunyanLogger.error(e);
    console.log('');
  }

  var MIDDLEWARE = {
    before : [],
    after : []
  };

  //load global middleware
  if(_.has(routeFile,'$GLOBALS$')){
    //GLOBALS
    var GLOBALS = routeFile['$GLOBALS$'];

    //remove special $GLOBALS$ key
    delete routeFile['$GLOBALS$'];

    MIDDLEWARE.before = _.union( MIDDLEWARE.before,  arrify( _.values(GLOBALS.middleware.before) ) );
    MIDDLEWARE.after = _.union(MIDDLEWARE.after,  arrify( _.values(GLOBALS.middleware.after) ));

  }

  //loop thru the exported object of methods
  _.each(routeFile, function(routeData, route){

    if(_.has(routeData,'middleware')){
      MIDDLEWARE.before = _.union(MIDDLEWARE.before,  arrify( _.values(routeData.middleware.before) ));
      MIDDLEWARE.after = _.union(MIDDLEWARE.after,  arrify( _.values(routeData.middleware.after) ));
    }

    _.each(routeData.methods, function( func, method ){

      routeData.name = routeData.name || routeName || null;

      //if route starts with caret...means we omit the version/api folder
      if(/^\^/.test(route)){
        routeData.path = util.format('/%s', route.replace(/^\^/,'') ).replace(/\/{2,}/,'/');
      }
      else{
        routeData.path = util.format('/%s/%s', version, route ).replace(/\/{2,}/,'/');
      }

      var ROUTE = _.pickBy( _.pick(routeData,'name','path'), _.identity );

      //for semver routes...
      if(semver.valid(version) !== null ){
        ROUTE = {
          path:route, version:version
        }
      }

      //
      var routeName = ROUTE.path || JSON.stringify(route);

      thisRoutes.push({
        name : ROUTE.name,
        path : ROUTE.path,
        func : func,
        method : method,
        middleware : MIDDLEWARE
      });


      //add route to routes folder...
      //Dont add router if skip files
      if( !_.has(skipPaths,versionDir) || skipPaths[versionDir] === false   ){

        // console.log('load')

        if( ROUTE.name ){
          EXPORTS.routes[ROUTE.name] = {
            name : ROUTE.name,
            path : ROUTE.path,
            func : func,
            // method : method,
            // middleware : MIDDLEWARE
          };
        }

        if( routeData.exports && _.isObject(routeData.exports) ){

          _(routeData.exports).each((f,k) => {
            if(_.isFunction(f)){ EXPORTS[k] = f; }
          });

        }

        //
        routeFile.exports = EXPORTS;

        routeFile.this = {
          path : '/'+ path.dirname(filePath).split(path.sep).pop(),
          file : filePath,
          routes : thisRoutes
        }

      }

    });

  });

  // console.log(routeFile.this.routes);
  return routeFile.this ;

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
