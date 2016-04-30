
var path = require('path');

/*
  set API path
  This path points to where you store your route files.
  Ideal structure looks like this:

    ├──API DIRECTORY
        ├──version number
          ├── api-file.js
          ├──api-file-2.js

  HOT API will traverse the structure and load all routes
*/


var apiDir = path.join(__dirname,'versions');
//Name your API
var apiName = 'My Fancy API Server';

//we pass the values as an options object
var options = {
  apiDir : apiDir,
  apiName : apiName,
  apiPort : 8082
}

//initialize your server by requiring HOT API
//Save the return value into a variable (app), you will need this variable to load your plugins
var app = require('./app')(options);

//place your plugins in an array. Use app variable above to access the restify & server objects
var pluginsArr = [

  //acceptParser plugin
  app.restify.acceptParser(app.server.acceptable),

  //throttle plugin
  app.restify.throttle({
    burst: 100, rate: 50, ip: true, overrides: { '192.168.1.1': { rate: 0, burst: 0 } }
  })

];

//start the server now
app.start(pluginsArr);
