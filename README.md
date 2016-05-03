
# hot-api
A fast API module written on top of Restify. Structured to be easy, extensible and allow for rapid (HOT/LIVE) reloading of routes.

**If running a version below 0.0.7, please update to 0.0.8 and above!**

## API's that KISS
We like to think that in a world such as this, where microservices and real time sites consume from API's, then such API's should be easy to roll out, cheap and effective.

This is one expample that attempts to KISS (Keep it simple-stupid) and In under 15 minutes, you will have your API ready. With Live Reloading. **Try It!**

##Start with

```javascript

var path = require('path');

/*
  set API path
  This path points to where you store your route files.
  Ideal structure looks like this:

    ├──API DIRECTORY
        ├──VERSION DIRECTORY
          ├── api-file.js
          ├──api-file-2.js

  HOT API will traverse the structure and load all routes
*/


//we pass the values as an options object
//NOTE: While certain values (keys) are optional apiDir (apiOptions.apiDir) is not and must be entered and be a valid directory path
var options = {
  apiDir : './myAPIFolder', //folder or array of folders where API routing files are stored
  apiName : 'My Fancy API Server', //A fancy name for your server
  apiPort : 8082,
  // apiDevMode : true, // Indicates development mode if true. Default is false
  // apiLogDir : './logs', //location where Bunyan should write its physical logs. Defaults to "App Directory/logs"
  // apiVerbosity : 1, //determines how much details are output via the route logger. Defaults to 1 and has three possible values (0=logging off, 1=medium verbosity, 2=max verbosity)
  // apiServerOpts : {} //other restify server options
}

//initialize your server by requiring HOT API
//Save the return value into a variable (app), you will need this variable to load your plugins
var app = require('hot-api')(apiOptions);

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


```

## When we start Hot API
![logs](https://cloud.githubusercontent.com/assets/5348246/14970479/ce81cae8-10d1-11e6-96da-6fc9d6d0449b.png)

### Server Options

As stated above. You can further set server options to give you better control of how Restify functions. Below are some of those options:

```javascript
 {
    certificate: null,     // If you want to create an HTTPS server, pass in the PEM-encoded certificate and key
    key: null,             // If you want to create an HTTPS server, pass in the PEM-encoded certificate and key
    formatters: null,      //  Custom response formatters for res.send()
    spdy: null,            // Any options accepted by node-spdy
    handleUpgrades: false  // Hook the upgrade event from the node HTTP server, pushing Connection: Upgrade requests through the regular request handling chain; defaults to false
 };
```

**NOTE:** be careful to enter the correct paths or else these options could break your API and lead to errors. These options are mostly optional and can be safely ignored.

**NOTE:** Hot API uses Bunyan as the default logger. If you wish to overide this functionality, then switch verbosity to false and then *require* and use your own loggers within your respective routes. **Restify + Bunyan** are currently battle tested and in production use at Joyent so we highly recommend you use the inbuilt Bunyan logger.


# Routing
The final step in creating your **Hot API** is creating routes that receive and respond to your API calls.

**Hot API** is made to automatically find your files and mount those routes into the server instance, whilst allowing you to make **Hot Edits** with automatic **Hot Reloading**.

To do so, go to your API Folder as declared via the **apiDir** option;

```bash
	cd [YOUR APP DIR]; #If not there already
	mkdir myAPIFolder; #If not existing

    #Now we need to create a versions folder...
    mkdir 0.0.1;

    #Note: If folder name uses a valid semver pattern, then Hot API will mount the paths with relevant version numbers. However, if not a valid semver pattern, the folder is appended to route name i.e. '/folder_name/route'

    #create javascript route file
    vi routes.js; #Or whatever name you please...

    #Add route content...& watch your API come to live.    

```

## The Route File Pattern
All route files should export an object as shown below:

```javascrpit

    var route = {

      //Global middlewares are applied to all exported routes
      '$GLOBALS$' : {

        middleware: {

          //runs before request is processed
          before: {
            auth : function(req,res,next){
              req.log.info('auth');
              next();
            }
          },

          //runs after request is processed
          after: {
            anotherGlobalMiddleware : function(req,res,next){
              req.log.info('anotherGlobalMiddleware');
              next();
            }
          }
        }

      },

      // Route
      '/hello'  : {
        name : 'GET_Hello',
        methods : {
          get : function (req, res, next) {

            req.log.debug('This is a debug Message')

            res.send('Hello & Welcome to '+ this.name);
            next();
          }
        },
        middleware: {

          //runs before request is processed
          before: {
            routeSpecificMiddleware : function(req,res,next){
              req.log.info('routeSpecificMiddleware');
              next();
            }
          },

          //runs after request is processed
          after: {
            routeSpecificMiddleware : function(req,res,next){
              req.log.info('routeSpecificMiddleware');
              next();
            }
          }
        }
      }
    };


    //export route
    module.exports = route;


```

### OK, let's skin this sheep

**$GLOBALS$ :** This key is used to hold all global *middleware*. Global middleware are:
- Called on all route (before and after route execution)
- Called before all other route-specific middleware.

**/route :** every route is created as a unique key which holds an the *route object*. Every route object should be as follows:

```javascript
'/route': {

            {
                name : 'GET_Hello',
                methods : {
                get : function (req, res, next) {...},
                post : function (req, res, next) {...}
                other_method : function ...
            },
            middleware: {
                //runs before request is processed
                before: {
                    routeSpecificMiddleware : function(req,res,next){...}
                },

                //runs after request is processed
                after: {
                    routeSpecificMiddleware : function(req,res,next){...}
                }
            }

         }
```

This pattern allows you to create routes easily and use numerous methods and middleware with each route.

Further, via **$GLOBAL$ middleware** you can declare a set of middleware that are applied to all routes in that file.

## A word on directories & Versioning

To ensure maximum performance and remove the overhead incurred by observing very deep directory trees, Hot API only observes one level deep.

Therefore, you should not place your route files any deeper than:

```

    ├──API DIRECTORY
           ├──VERSION DIRECTORY

```

Also note that where *VERSION DIRECTORY* is a valid semver pattern, then the mounted with that version number. Please read on [Versioned Routes](http://restify.com/#routing) and see how to use headers to access different versions.

Where the *VERSION DIRECTORY* is not a valid semver pattern, then the route is loaded as *"/VERSION DIRECTORY/route"*.

## Use Arrays & Symlinks!

Hot API is built to be a *'drop in'* module for serving your APIs effectively with minimal configuration. As such, unlike other API modules, Hot APIs core is decoupled with its routes. Instead, Hot API requires you provide a directory *(apiDir)* from where your route files are served.

This difference is not only significant but the magic of Hot API.

By serving routes from a Folder, we have givent you the power to enter folder Arrays and even use symlinks within the API DIRECTORY folder.

Picture the following scenario:
- You run a conservation protecting elephants, lions and rhinos in Kenya.
- You gather data on each of the three animals and want to share it with the world through three apis */elephants/[routes]*, */rhinos/[routes]* and */lions/[routes]*.

Here is how you can use the power of **Hot API**.

#### Method 1

- Create the three directories (lions, elephants and rhinos) & setup Route Files in each of them.
- Then create an API project/directory called API and initialize Hot API within it.
- For the **apiDir** option enter an array instead i.e. ```['/elephants_absolute_path', '/lions_absolute_path', '/rhibos_absolute_path']```.

#### Method 2
- Create the three directories (lions, elephants and rhinos) & setup Route Files in each of them.
- Then create an API project/directory called API and initialize Hot API within it.
- Create a directory within the API project called API_Directory
- Within *API_Directory* create symlinks to each of the resource directories *'/elephants_absolute_path', '/lions_absolute_path' and '/rhibos_absolute_path'*
- For the **apiDir** option enter the absolute path to API_Directory

## Migrating From one version to another

Once in a while, you will need to migrate from one API version to another, say version **1.0.0** to **1.0.1**. During this migration period, you want to keep 1.0.0 active till all users have successfully migrated to 1.0.1.

With Hot API, this is a trivial task!

You simply have both 1.0.0 and 1.0.1 folders within your API DIRECTORY. That way, users have access to both versions at the same time.

When ready to deprecate 1.0.0, you simply need to create a ```.skip``` file within the *1.0.0* folder. Any routes mounted from Route Files in that folder will be immediately *unmounted* making the API endpoints unavailable.

Deleting the ```.skip``` file makes the API available againa and all routes are immediately (hot) mounted!
