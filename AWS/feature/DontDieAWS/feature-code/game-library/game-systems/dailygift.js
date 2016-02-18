var async = require("async");
var util = require("../util/util.js");
var kGameContextFlags = require("../gamecontext.js").kGameContextFlags;
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var kDailyGiftTable = cloudCanvasSettings.DailyGiftTable;
var kDailyGiftTableHashKey = "Date";
var kDailyGiftFields = ['Type', 'Name'];
var kDailyGiftCachedItemName = "TodaysGift";
var kGiftRefreshTimeInMinutes = 2;

exports.systemName = "dailyGift";
exports.requiredFlags = kGameContextFlags.updatePlayer;

exports.OnRegister = function (dontDie) {
    
    dontDie.RegisterConstant(this, "kTable", kDailyGiftTable);
    dontDie.RegisterConstant(this, "kTableKeyName", kDailyGiftTableHashKey);
    dontDie.RegisterConstant(this, "kCachedItemName", kDailyGiftCachedItemName);

    dontDie.RegisterCommand("getDailyGift", kGameContextFlags.updatePlayer, function (gameContext, event, callback) {
        gameContext.systems.dailyGift.TryToGiveGift(gameContext, callback);
    });
}

exports.Init = function (gameContext, callback) {
    callback(null, gameContext);
};

exports.TryToGiveGift = function (gameContext, callback) {
    
    if (this.TimeUntilPlayerIsEligible(gameContext.systems.player) > 0) {
        callback(null, gameContext);
        return;
    }
        
    var dailyGift = this;

    async.waterfall(
    [
        function (callback) {
            dailyGift.GetTodaysGifts(gameContext, callback);
        },

        function (gameContext, gifts, callback) {
            if (gifts == null || gifts.length == 0) {
                callback(null, gameContext, false);
                return;
            }
                
            for (var i = 0; i < gifts.length; ++i) {
                var gift = gifts[i];

                if (gift.Type == "item") {
                    gameContext.systems.player.AddToInventory(gameContext, gift.Name, function (err, data) {
                        callback(null, gameContext, err == null);
                    });
                    return;
                }
                else if (gift.Type == "mission") {
                    gameContext.systems.missionManager.StartMission(gameContext, gift.Name, function (err, data) {
                        callback(null, gameContext, err == null);
                    });
                    return;
                }
                else {
                    callback("Error, daily gift type not specified");
                    return;
                }
            }

        },
        
        function (gameContext, giftGiven, callback)
        {

            if (giftGiven) {
                gameContext.systems.player.fields.SetLastDailyGiftTime(util.GetFormattedDate(true));
            }

            callback(null, gameContext);
        }
    ],

    callback);
};

exports.TimeUntilPlayerIsEligible = function (player) {

    if (!player.fields.LastDailyGiftTimeIsDirtyOrLoaded()) {
        return 0;
    }

    var dailyGiftTimeInMinutes = util.GetElapsedTimeInMinutes(util.GetFormattedDate(false), player.fields.GetLastDailyGiftTime());

    if (dailyGiftTimeInMinutes < 0) {
        return 0;
    }
    else {
        var minutesElapsedSinceDayStart = util.GetElapsedTimeInMinutes(util.GetFormattedDate(false), util.GetFormattedDate(true));
        var windowStartTimeInMinutes = minutesElapsedSinceDayStart - (minutesElapsedSinceDayStart % kGiftRefreshTimeInMinutes);
        
        var timeIntoWindow = dailyGiftTimeInMinutes - windowStartTimeInMinutes;
        
        if (timeIntoWindow < 0 || timeIntoWindow > kGiftRefreshTimeInMinutes) {
            return 0;
        }

        return kGiftRefreshTimeInMinutes - timeIntoWindow;
    }
}

exports.GetTodaysGifts = function (gameContext, callback) {
    
    async.waterfall([
        function (callback) {
            gameContext.systems.gameDataLUTable.GetCachedItem(gameContext, kDailyGiftCachedItemName, callback);
        },
        function (gameContext, giftData, callback) {
            
            var todaysDateStr = util.GetFormattedDate(false);
            var todaysDateAndTimeStr = util.GetFormattedDate(true);
            var todaysDateAndTime = new Date(todaysDateAndTimeStr);

            var gifts = [];
            
            if (giftData == null) {
                callback(null, gameContext, gifts);
                return;
            }

            for (var i = 0; i < giftData.Gifts.length; ++i) {
                
                var gift = giftData.Gifts[i];
                var beginTime = new Date(todaysDateStr);
                
                if (gift.Time != null) {
                    beginTime = new Date(todaysDateStr + " " + gift.Time);
                }
                
                var endTime = null;
                
                if (gift.EndTime != null) {
                    endTime = new Date(todaysDateStr + " " + gift.EndTime);
                }
                else {
                    endTime = new Date(todaysDateStr + " 23:59:59");
                }

                if (todaysDateAndTime >= beginTime && todaysDateAndTime <= endTime) {
                    gifts.push( gift );
                }
            }

            callback(null, gameContext, gifts);
        },
    ],
    
    function (err, gameContext, gifts) {
        callback(err, gameContext, gifts);
    });
}

exports.Finish = function (gameContext, callback) {
    
    gameContext.output.dailyGift = {
        refreshTime: kGiftRefreshTimeInMinutes
    };

    gameContext.output.dailyGift.timeUntilEligible = this.TimeUntilPlayerIsEligible(gameContext.systems.player);

    callback(null, gameContext);
}