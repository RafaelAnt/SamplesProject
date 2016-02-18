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
var dontDie = require("../../game-library/dontdie.js");
var kGameContextFlags = require("../../game-library/gamecontext.js").kGameContextFlags;

dontDie.Init();

exports.handler = function (event, context) {
    
    if (!dontDie.IsIdentityValid(context)) {
        context.fail("Identity is not valid");
        return;
    }
    
    if (event.commands == null) {
        context.fail("No valid commands given");
        return;
    }

    var totalCommandFlags = 0;
    var commandTasks = [null];
    var commandRegistry = dontDie.commandRegistry;
    
    event.commands.forEach(function (commandName) {
        if (!(commandName in commandRegistry)) {
            context.fail("'" + commandName + "' is not a command");
            return;
        }
                
        var command = commandRegistry[ commandName ];
        
        console.log("Command: " + commandName);

        totalCommandFlags |= command.flags;

        commandTasks.push(function (gameContext, callback) {
            command.Execute(gameContext, event, callback);
        });
    });
    
    if (totalCommandFlags & kGameContextFlags.updatePlayer) {
        console.log("Update player flag found");
    }
    
    if (totalCommandFlags & kGameContextFlags.loadHighScoreTable) {
        console.log("High score table flag found");
    }

    var playerId = context.identity.cognitoIdentityId;

    dontDie.CreateGameContext(context, playerId, totalCommandFlags, function (err, gameContext) {
        
        if (err != null) {
            return dontDie.FinishGameContext(err, gameContext);
        }

        commandTasks[0] = function (callback) {
            callback(null, gameContext);
        };
        
        async.waterfall(commandTasks, dontDie.FinishGameContext);
    });
};