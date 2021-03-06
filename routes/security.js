var Q = require('q');

module.exports = function (templateVarService, keygrip, securityService, securityConfigService, loginMethods, homePageService) {
    var routes = {};

    routes.login = function (req, res) {
        if (req.user && (!req.user.isGuest || req.query.redirect_url)) {
            successLoginRedirect(req.user, req, res);
        } else if (req.query.user_id && keygrip.verify(req.query.user_id, req.query.sign)) {
            securityService.loginUserWithIdIfExists(req, req.query.user_id).then(function (user) {
                res.redirect(securityService.withUserScope(user, function () { return homePageService.homePage() }));
            }, function () {
                res.redirect('/login');
            }).done();
        } else {

            var forceRedirectUrl = null;

            templateVarService.setupLocals(req, res, {
                redirect_url: req.query.redirect_url,
                loginMethods: loginMethods.map(function (method) {
                    var loginMethod = {
                        label: method.label,
                        url: method('https://' + req.header('Host') + '/login', req, res)
                    }

                    if (method.forceRedirect && !req.query.legacylogin)
                        forceRedirectUrl = loginMethod.url;

                    return loginMethod;
                })
            });

            if (forceRedirectUrl)
                res.redirect(forceRedirectUrl)
            else
                res.render('login');
        }
    };

    function successLoginRedirect(user, req, res) {
        if (req.query.redirect_url) {
            var userId = user.id.toString();
            res.redirect(req.query.redirect_url + "?" + [
                ['user_id', userId],
                ['sign', keygrip.sign(userId)]
            ].map(function (s) {
                return s.join('=')
            }).join('&'));
        } else {
            res.redirect(securityService.withUserScope(user, function () { return homePageService.homePage() }));
        }
    }

    routes.performLogin = function (passportAuthenticate) {
        return function (req, res) {
            passportAuthenticate(req, res).then(function (user) {
                if (user) {
                    return Q.nfbind(req.logIn.bind(req))(user).then(function () {
                        successLoginRedirect(user, req, res);
                    });
                } else {
                    res.redirect('/login?redirect_url=' + req.query.redirect_url);
                }
            }, function (err) {
                res.redirect('/login?redirect_url=' + req.query.redirect_url);
            }).done();
        };
    };

    routes.logout = function (req, res) {
        req.logout();
        res.redirect('/');
    };

    routes.signUp = function (req, res, next) {
        routes.setAccessControlHeaders(res);
        if (!securityConfigService.allowSignUp) {
            res.sendStatus(403);
        } else {
            securityService.createUser(req.body.username, req.body.password, []).then(function () { //TODO use guest user if we have one
                res.sendStatus(200);
            }).catch(next);
        }
    };

    routes.apiSignIn = function (req, res, next) {
        routes.setAccessControlHeaders(res);
        securityService.authenticateAndGenerateToken(req.body.username, req.body.password).then(function (token) {
            if (token) {
                res.json({ token: token })
            } else {
                res.status(403).send("Not authenticated");
            }
        }).catch(next);
    };

    routes.setAccessControlHeaders = function (res) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type, X-Access-Token");
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT');
    };

    routes.authenticateWithTokenMiddleware = function (req, res, next) {
        routes.setAccessControlHeaders(res); //TODO should be called only where appropriate
        if (req.method === 'OPTIONS') {
            res.status(200).send();
        } else if (req.header('X-Access-Token')) {
            securityService.loginWithToken(req, req.header('X-Access-Token')).then(function (user) {
                if (user) {
                    next();
                } else {
                    res.status(403).send("Not authenticated");
                }
            }).catch(next);
        } else if (req.query.token) {
            securityService.loginWithToken(req, req.query.token).then(function (user) {
                if (user) {
                    next();
                } else {
                    res.status(403).send("Not authenticated");
                }
            }).catch(next);
        }
        else {
            next();
        }
    };

    return routes;
};