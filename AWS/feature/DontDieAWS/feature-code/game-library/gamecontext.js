/*
*  All or portions of this file Copyright (c) Amazon.com, Inc. or its affiliates or
*  its licensors.
*
* For complete copyright and license terms please see the LICENSE at the root of this
* distribution (the "License"). All use of this software is governed by the License,
* or, if provided, by the license below or the license accompanying this file. Do not
* remove or modify any license notices. This file is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
*
*/
var async = require("async");

exports.kGameContextFlags = {
    updatePlayer       : 0x0001,
    loadHighScoreTable : 0x0002
};

exports.GameContext = function (dontDie, lambdaContext, playerId) {

    this.dontDie = dontDie;
    this.lambdaContext = lambdaContext;
    this.flags = 0;
    this.playerId = playerId;
    this.systems = {};
    this.output = {};

    this.Init = function (flags, callback)
    {
        this.flags = flags; 
        var gameContext = this;
        var dontDie = this.dontDie;
        
        var initTasks = [];
        var systemRegistry = this.dontDie.systemRegistry;

        for (var systemName in systemRegistry) {
            
	    // Removing the system from the require cache so that the game systems are not shared
	    // between concurrent running lambdas
            delete require.cache[ require.resolve(systemRegistry[systemName]) ];
            var system = require(systemRegistry[systemName]);

            if (system.requiredFlags != null && (( this.flags & system.requiredFlags) != system.requiredFlags)) {
                continue;
            }
            
            if (system.methodRequiredFlags != null) {
                for (var methodName in system.methodRequiredFlags) {
                    var methodReqFlags = system.methodRequiredFlags[methodName];

                    if (!((this.flags & methodReqFlags) == methodReqFlags)) {
                        console.log("Method '" + methodName + "' is missing a required flag.  Setting it to null.");
                        system[methodName] = null;
                    }
                }
            }
            
            initTasks.push( system.Init.bind(system, gameContext) );
            this.systems[systemName] = system;
        }

        async.parallel(initTasks, function (err, gameContexts) {
            callback(err, gameContext);
        });
    }

    this.Finish = function (callback) {
        
        var gameContext = this;
        var dontDie = this.dontDie;

        async.waterfall([
            function (callback) {
                
                var finishTasks = [];
                
                for (var systemName in gameContext.systems) {
                    if (gameContext.systems.hasOwnProperty(systemName) && systemName != "player") {
                        var system = gameContext.systems[systemName];
                        finishTasks.push(system.Finish.bind(system, gameContext));
                    }
                }

                async.parallel(finishTasks, callback);
            },

            function (gameContexts, callback) {
                var player = gameContext.systems.player;
                
                if (player != null) {
                    return player.Finish(gameContext, callback);
                }
                else {
                    return callback(null, gameContext);
                }
            }
        ],

        function (err, gameContexts) {
            callback(err, gameContext);
        });
    }
};