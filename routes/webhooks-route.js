var _ = require('underscore');

module.exports = function (app, webhookService, appAccessRouter) {
    var route = {};

    route.configure = function () {
        _.forEach(webhookService.webhookPathToHandler, function (handler, methodName) {
            var isGet = methodName.toLowerCase().startsWith('get');

            if (isGet)
                appAccessRouter.get('/webhooks/' + methodName, handler);
            else
                appAccessRouter.post('/webhooks/' + methodName, handler);
        })
    };

    return route;
};