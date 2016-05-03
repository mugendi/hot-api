
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
