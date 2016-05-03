
var path = require('path');
var _ = require('lodash');
var rootDir = path.dirname(require.main.filename);


var API = function(options){



  //this options
  this.options = _.extend(
    {
      apiName : 'Hot API',
      apiPort : 8080,
      apiDevMode : false,
      apiLogDir : path.join(rootDir, 'logs' ),
      apiVerbosity: 1,
      apiServerOpts : {
          certificate: null,     // If you want to create an HTTPS server, pass in the PEM-encoded certificate and key
          key: null,             // If you want to create an HTTPS server, pass in the PEM-encoded certificate and key
          formatters: null,      //  Custom response formatters for res.send()
          spdy: null,            // Any options accepted by node-spdy
          handleUpgrades: false  // Hook the upgrade event from the node HTTP server, pushing Connection: Upgrade requests through the regular request handling chain; defaults to false
        }
    },
    options
  );

  this.options.apiVerbosity = _.parseInt(  this.options.apiVerbosity );

  this.options.apiServerOpts.name = this.options.name;

  //reject some server options to avoid conflicts with the rest of the api
  //version
  delete this.options.apiServerOpts.version;
  //log
  delete this.options.apiServerOpts.lo;


  return this.initialize();

};

API.prototype = require(path.join(__dirname,'api-functions'));




//export function...
module.exports = function(options){
  return new API(options);
};
