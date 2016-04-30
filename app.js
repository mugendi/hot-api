var restify = require('restify');
var path = require('path');
var dirTree = require('dir-tree');
var _ = require('lodash');
var util = require('util');
var arrify = require('arrify');
var exec = require('child_process').exec;
var chalk = require('chalk');
var watch = require('watch');

var server = {};
var fileToLoad = '';
var route = '';

var apiDir = null;
var apiName = '';
var pluginsARR;
var Reload = false;





module.exports = function(apiDir, apiName){

  //load routes on startup
  initialize(apiDir, apiName);

  return {
    restify : restify,
    server : server,
    start : start
  }

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
  Reload = reload;

  //set process name
  process.title = APIName ;

  //if Reload...
  if(reload){
    console.log( chalk.white("\n----------------------------------------------------------") );
    console.log( chalk.white("\tClosing Server & Reloading...") );
    console.log( chalk.white("----------------------------------------------------------\n") );

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
              // console.log(file)
              //Load Route File
              var RF = require(fileToLoad);

              //GLOBALS
              var globals = RF['$GLOBALS$'];
              //remove special $GLOBALS$ key
              delete RF['$GLOBALS$'];

              var middleWare = {
                before : arrify( _.values(globals.middleware.before) ),
                after : arrify( _.values(globals.middleware.after) )
              };

              // console.log(middleWare);

              //loop thru the exported object of methods
              _.each(RF, function(routeData, route){

                middleWare.before = _.union(middleWare.before,  arrify( _.values(routeData.middleware.before) ));
                middleWare.after = _.union(middleWare.after,  arrify( _.values(routeData.middleware.after) ));

                // console.log(middleWare);

                _.each(routeData.methods, function( func, method ){
                  route = util.format('/%s/%s', version, route ).replace(/\/{2,}/,'/');

                  console.log( chalk.magenta("\tRoute " + chalk.bold(route) + " initialized.") );
                  //create server route
                  server[method](route, middleWare.before, func , middleWare.after  );

                });

              });

            }

          });

        }

      });

    }

  });


  //create server
  server = restify.createServer();
  if(reload){ start(pluginsARR, reload); }

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

  //plugins
  // set server plugins
  console.log( chalk.blue("\n----------------------------------------------------------") );
  console.log( chalk.blue("\tSetting Plugins...") );
  console.log( chalk.blue("----------------------------------------------------------\n") );

  _.each(pluginsARR, function(plugin){
    console.log(chalk.blue( util.format("\tPlugin: %s" , chalk.bold(plugin.name) )));
    server.use(plugin);
  });

  console.log( chalk.blue("\n----------------------------------------------------------\n") );

  //start listening
  server.listen(8080, function() {

    console.log( chalk.green("\n----------------------------------------------------------") );
    console.log( chalk.green( util.format( "\t%s listening at %s", chalk.bold(process.title) , server.url) ));
    console.log( chalk.green("----------------------------------------------------------\n") );

    console.log( chalk.magenta("\n----------------------------------------------------------") );
    console.log( chalk.magenta("\tInitializing your routes...") );
    console.log( chalk.magenta("----------------------------------------------------------\n") );

  });

}


/**
 * reload API Server
 */
function reloadServer(){
  initialize(apiDir, apiName, true);
}



//Watch file changes on API Directory
//Uses Interval to ensure apiDir is set
var interval = setInterval(function(){

  if(apiDir){

    console.log( chalk.gray("\n----------------------------------------------------------") );
    console.log( chalk.gray("\tWatching API Routes On :" + apiDir) );
    console.log( chalk.gray("----------------------------------------------------------\n") );

    watch.createMonitor(apiDir, function (monitor) {
      //  monitor.files['/home/mikeal/.zshrc'] // Stat object for my zshrc.
       monitor.on("created", reloadServer);
       monitor.on("changed", reloadServer);
       monitor.on("removed", reloadServer);
      //  monitor.stop(); // Stop watching
    });

    clearInterval(interval);
  }

},1000)
