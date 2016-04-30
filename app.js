var restify = require('restify');
var path = require('path');
var dirTree = require('dir-tree');
var _ = require('lodash');
var util = require('util');
var arrify = require('arrify');
var chalk = require('chalk');
var watch = require('watch');
var fs = require('fs');
var clearRequire = require('clear-require');
var semver = require('semver');

//loggers
var pino = require('pino');
var pinoPretty = pino.pretty();
pinoPretty.pipe(process.stdout);
var pinoLogger = require('restify-pino-logger');

var server = {};
var fileToLoad = '';
var route = '';
var MONITOR = null;

var apiDir = null;
var apiDirExists = false;
var apiLogger = null;
var apiName = 'Hot Api Server';
var apiPort = 8080;
var pluginsARR;
var port;

var neededOptions = [ 'apiDir' ];



//export function...
module.exports = function(options){

  //ensure we have all needed values
  var diff = _.difference(neededOptions , _.keys(options));

  if( !diff.length ){

    //load routes on startup
    apiDir = options.apiDir;
    apiName = options.apiName || apiName;
    apiPort = options.apiPort || apiPort;

    //some logger options
    var loggerOpts = {
      name: apiName,
      safe: false,
      serializers: {}
    };

    apiLogger = options.apiLogger || pinoLogger( loggerOpts, pinoPretty ) ;

    //use fs.statSync to throw error if path does not exist
    if(  ( stat = fs.statSync(apiDir) ) && stat.isDirectory() ){
      //ok initialize now
      initialize(apiDir, apiName );
    }
    else{
      throw new Error( util.format("% does not exist or is not a Directory.", apiDir));
    }

  }
  else{
    throw new Error(
      util.format("All required options not entered. Please complete the following options: %s", util.inspect(diff))
    );
  }



  return {
    restify : restify,
    server : server,
    start : start
  };

};

/**
 * Function to load API routes
 * @param  string APIDir directory of API's
 * @param  boolean reload determines when an automatic load
 */
function initialize(APIDir, APIName, reload){

  reload = reload || false;
  apiName = APIName || 'API-SERVER';
  apiDir = APIDir;

  //set process name
  process.title = APIName ;

  //if Reload...
  if(reload){

    logLined( 'gray', "EXCUSE! NEED TO REFUEL!" );
    logLined( 'white', "CLOSING SERVER & RELOADING..." );

    server.close(function(){
      loadRoutes(APIDir, APIName, reload);
    });

  }
  else{
    loadRoutes(APIDir, APIName, reload);
  }




}

/**
 * Loads API Routes
 * @param  string APIDir  [description]
 * @param  string APIName [description]
 * @param  boolean reload  [description]
 */
function loadRoutes(APIDir, APIName, reload){


  // console.log(apiDir)
  dirTree(apiDir).then(function (tree) {
    //This Directory indeed exists
    apiDirExists = true;
    var globals = {};

    // console.log(tree)

    //if we have folders within the tree...
    if(_.size(tree)){

      //load all version files
      _.each(_.keys(tree), function(version){
        // console.log(version)
        //
        if(!~_.indexOf(_.keys(tree[version]),'.skip')){

          _.each(tree[version], function( bool, file ){

            fileToLoad = path.join(apiDir, version, file);

            //only load js files
            if(file.split('.').pop()=='js'){
              // console.log(fileToLoad)
              //Load Route File
              var RF = _.clone( require(fileToLoad) );
              //to enable updates on reload, we must clear this require
              // clearRequire(fileToLoad);

              if(_.has(RF,'$GLOBALS$')){
                //GLOBALS
                globals = RF['$GLOBALS$'];
                //remove special $GLOBALS$ key
                delete RF['$GLOBALS$'];

                var middleWare = {
                  before : arrify( _.values(globals.middleware.before) ),
                  after : arrify( _.values(globals.middleware.after) )
                };

              }
              else{
                var middleWare = {
                  before : [],
                  after : []
                };
              }

              // console.log(middleWare);

              //loop thru the exported object of methods
              _.each(RF, function(routeData, route){

                if(_.has(routeData,'middleware')){
                  middleWare.before = _.union(middleWare.before,  arrify( _.values(routeData.middleware.before) ));
                  middleWare.after = _.union(middleWare.after,  arrify( _.values(routeData.middleware.after) ));
                }

                // console.log(middleWare);

                _.each(routeData.methods, function( func, method ){
                  // route =

                  // console.log(route)

                  log( chalk.magenta("Route " + chalk.bold(route) + " Initialized.") );

                  var path = util.format('/%s/%s', version, route ).replace(/\/{2,}/,'/');



                  if(semver.valid(version) !== null ){
                    path = {
                      path:route, version:version
                    }
                  }

                  // console.log(path);
                  //create server route
                  server[method](path , middleWare.before, func , middleWare.after  );

                });


              });

            }

          });

        }

      });

      //watch routes now
      watchDir(apiDir);

    }

  });


// throw new Error( util.format("%s does not exist!", apiDir ))
  //create server
  server = restify.createServer();
  if(reload){ start(pluginsARR, reload); }

  //set logger
  server.use(apiLogger);

}

/**
 * [start description]
 * @param  {[type]} pluginsArr [description]
 * @param  {[type]} reload     [description]
 * @return {[type]}            [description]
 */
function start(pluginsArr, reload){
  reload = reload || false;
  pluginsARR = pluginsARR || pluginsArr;

  logLined( 'gray', "AHEM! WE'RE LAUNCHING. BELT UP!" );
  //plugins
  // set server plugins
  logLined( 'blue', "SETTING PLUGINS..." );

  _.each(pluginsARR, function(plugin){
    log(chalk.blue( util.format("Plugin: %s set." , chalk.bold(plugin.name) )));
    server.use(plugin);
  });


  //start listening
  server.listen( apiPort, function() {
    logLined( 'green', util.format( "%s: NOW LISTENING AT %s", chalk.bold(process.title) ,chalk.bold( server.url) ));
    logLined( 'magenta', "INITIALIZING YOUR ROUTES..." );
  });

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

function log(msg){
  // var pad = Math.abs((chars - msg.length)/2);
  var pad = 1;
  console.log(  _.repeat(' ', pad ) + chalk.gray("~ ") + msg );
}

/**
 * reload API Server
 */
function reloadServer(f, stat){
  initialize(apiDir, apiName, true);
}


//Watch file changes on API Directory
function watchDir(DIR){

  logLined( 'gray', "WATCHING API ROUTES FOR CHANGES ON: " + chalk.bold(DIR) );

  if(MONITOR){
    MONITOR.stop(); // Stop watching
  }


  watch.createMonitor(DIR, function (monitor) {
    MONITOR = monitor;
    //  monitor.files['/home/mikeal/.zshrc'] // Stat object for my zshrc.
     monitor.on("created", reloadServer);
     monitor.on("changed", reloadServer);
     monitor.on("removed", reloadServer);
  });

}
