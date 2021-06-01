const firebase = require('firebase');
const tmi = require('tmi.js');
const settings = require('./settings.json');

/** Twitch Functions */
const twitchClient = new tmi.client(
    {
        options: {debug: false},
        connection: {
            secure: true,
            reconnect: true
        },
        identity: {
            username: settings.TwitchUser,
            password: settings.TwitchAuth
        },
        channels: ["goombaBr"]
    }
)

twitchClient.connect();

twitchClient.on("connected", (address, port) => {
    console.log("Twitch Bot has started on port: " + port);
});

twitchClient.on("message", (channel, context, message, self) => {
    let username = context["display-name"];

    if(isCommand(channel, message, username)){
        let userData = getUser(username);
        let thisDate = new Date().getTime();
        console.log('getUser:', userData);

        if(!userData.length){
            userData = {
                "username": username,
                "lang": settings.LangDefault,
                "channel" : channel,
                "times": 0,
                "hit": false,
                "pallet": false,
                "luck" : settings.Luck,
                "created": thisDate,
                "updated": thisDate
            }
            saveUser(userData, 'startBot');
        }

        if(checkLoopTimes(userData)){    
            if(message.toLowerCase() === settings.Prefix + "loop"){
                userLoop(userData);
            }
    
            if(message.toLowerCase() === settings.Prefix + "pallet"){
                dropPallet(userData);
            }
        }
    }

    return false;
});

/** Firebase */
firebase.initializeApp(settings.Firebase);
let database = firebase.database();

firebase.database().ref("loops/").on("value", data => {
    
}, errorObject => {
    console.log(errorObject.code);
});

const getUser = (username) => {
    let returnData = [];
    
    database.ref('loops/' + username).on('value', function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            returnData[childSnapshot.key] = childSnapshot.val();
        });
    });

    return returnData;
}

const saveUser = (userData, msg) => {
    userData.updated = new Date().getTime();

    database.ref("loops/" + userData.username).set(userData, function(error) {
        if (error) {
            console.log(msg + ": Failed with error: " + error)
        } else {
            console.log(msg + ": User saved!");
        }
    });
}

const delUser = (username) => {
    database.ref('loops/' + username).remove();
    return false;
}

/** General Functions */
const getPrefix = (message) => {
    if(message.indexOf("dbd.") != -1){
        return true;
    }

    return false;
}

const isCommand = (channel, message, username) => {
    if(getPrefix(message)){
        if(settings.Commands.includes(message)){
            return true;
        }

        twitchClient.say(channel, "@" + username + " Command not found.");
    }

    return false;
}

const changeLang = (lang, userData) => {
    if(!settings.Langs.includes(lang)){
        getMsg(userData, "lang_not_found");
        return false;
    }
    
    userData.lang = lang;
    saveUser(userData, 'changeLang');
    getMsg(userData, "lang_changes");
}

const getMsg = (userData, msg) => {
    let lang = require('./lang/' + userData.lang + '.json');

    twitchClient.say(userData.channel, lang[msg].replace("{username}", userData.username));
}

/** Loop Functions */
const userLoop = (userData) => {
    if(Math.random() >= settings.Luck){
        userHit(userData);
        return false;
    } 
    
    let times = userData.times;
    userData.times = (times + 1);

    let luck = userData.luck;
    userData.luck = (luck + 0.02);

    getMsg(userData, "loop_sucess");
    saveUser(userData, 'userLoop');

    if(Math.random() < userData.luck){
        userWin(userData);
    }
}

const checkLoopTimes = (userData) => {
    if(userData.times < 4){
        return true;
    }

    userHit(userData);
}

const userHit = (userData) => {
    if(userData.hit){
        userDie(userData);
        return false;
    }

    if(userData.pallet){
        getMsg(userData, "hit_drop_pallet_soon");
    } else if(userData.pallet && userData.times === 0) {
        getMsg(userData, "hit_drop_pallet_closer");
    } else {
        getMsg(userData, "hit_not_drop_pallet");
    }
    
    userData.hit = true;
    userData.times = 0;
    saveUser(userData, 'userHit');
    return false;
}

const dropPallet = (userData) => {
    if(userData.pallet){
        userHit(userData);
    }

    userData.pallet = true;
    userData.times = 0;
    saveUser(userData, 'dropPallet');

    userLoop(userData);
}

const userWin = (userData) => {
    getMsg(userData, "win");
    delUser(userData.username);
    return false;
}

const userDie = (userData) => {
    getMsg(userData, "died");
    delUser(userData.username);
    return false;
}