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
var util = require("../util/util.js");
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var kItemTable = cloudCanvasSettings.ItemTable;
var kItemTableHashKey = "Name";
var kItemTableFields = ['Persist'];

exports.systemName = "itemManager";

exports.Init = function (gameContext, callback) {
    callback(null, gameContext);
};

exports.GetItem = function (gameContext, itemName, callback) {

    util.GetDynamoItem(gameContext, 
                       kItemTable, 
                       kItemTableHashKey, 
                       itemName, 
                       kItemTableFields, 
                       callback);
};

exports.Finish = function (gameContext, callback) {
    callback(null, gameContext);
}