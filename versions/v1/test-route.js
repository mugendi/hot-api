
var server = {

  //Global middlewares are applied to all exported routes
  '$GLOBALS$' : {

    middleware: {

      //runs before request is processed
      before: {
        auth : function(req,res,next){
          console.log('before');
          next();
        }
      },

      //runs after request is processed
      after: {
        anotherGlobalMiddleware : function(req,res,next){
          console.log('after');
          next();
        }
      }
    }

  },

  // Route
  '/hello/:name'  : {
    methods : {
      get : function (req, res, next) {
        res.send('hello ' + req.params.name);
        console.log('now');
        next();
      }
    },
    middleware: {

      //runs before request is processed
      before: {
        routeSpecificMiddleware : function(req,res,next){
          console.log('before');
          next();
        }
      },

      //runs after request is processed
      after: {
        routeSpecificMiddleware : function(req,res,next){
          console.log('after');
          next();
        }
      }

    }

  }

};


//export route
module.exports = server;
