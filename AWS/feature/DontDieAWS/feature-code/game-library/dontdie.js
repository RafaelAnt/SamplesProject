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
var async = require('async');
var gameContextModule = require('./gamecontext.js');

var systemModuleList = [
    "./game-systems/player.js",
    "./game-systems/missionmanager.js",
    "./game-systems/dailygift.js",
    "./game-systems/highscoretable.js",
    "./game-systems/itemmanager.js",
    "./game-systems/messageoftheday.js",
    "./game-systems/gamedatalutable.js",
    "./game-systems/achievements.js"

    // Add new systems here
];

exports.util = require("./util/util.js");
exports.kGameContextFlags = gameContextModule.kGameContextFlags;
exports.systemRegistry = {};
exports.systemConstants = {};
exports.commandRegistry = {};

exports.Init = function () {
    
    var dontDie = this;

    systemModuleList.forEach(function (packageName) {
        var system = require(packageName);
        dontDie.systemRegistry[ system.systemName ] = packageName;
        
        if (system.OnRegister != null) {
            system.OnRegister(dontDie);
        }
    });
};

exports.RegisterConstant = function (system, constantName, constantValue) {
    
    if (this.systemConstants[system.systemName] == null) {
        this.systemConstants[system.systemName] = {};
    }

    this.systemConstants[system.systemName][constantName] = constantValue;
}

exports.RegisterCommand = function (commandName, flags, executeFunc) {
    this.commandRegistry[commandName] = { "flags" : flags, "Execute" : executeFunc };
}

exports.IsIdentityValid = function (context) {
    return context.identity != null && context.identity.cognitoIdentityId != null;
}

exports.CreateGameContext = function (context, playerId, flags, callback) {
    var gameContext = new gameContextModule.GameContext(this, context, playerId);
    gameContext.Init(flags, callback);
}

exports.FinishGameContext = function (err, gameContext) {
    
    if (err != null) {
        gameContext.lambdaContext.fail(err);
        return;
    }
    
    gameContext.Finish(function (err, gameContext) {
        if (err != null) {
            console.log(err);
            console.log("Failure!");
            gameContext.lambdaContext.fail(err);
            return;
        }
        
        console.log("Success!");
        gameContext.lambdaContext.succeed(gameContext.output);
    });
}