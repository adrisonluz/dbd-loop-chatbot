const firebase = require('firebase');
const tmi = require('tmi.js');
const configs = require('dotenv').config();

/** Configs gerais */
const settings = {
    "TwitchUser": process.env.TWITCH_USER,
    "TwitchAuth": process.env.TWITCH_AUTH,
    "Prefix": process.env.PREFIX,
    "Luck" : process.env.LUCK,
    "Firebase" : {
        "apiKey": process.env.FIREBASE_API_KEY,
        "authDomain": process.env.FIREBASE_AUTH_DOMAIN,
        "projectId": process.env.FIREBASE_PROJECT_ID,
        "storageBucket": process.env.FIREBASE_STORAGE_BUCKET,
        "messagingSenderId": process.env.FIREBASE_MESSAGING_SENDER_ID,
        "appId": process.env.FIREBASE_APP_ID,
        "measurementId": process.env.FIREBASE_MEASUREMENT_ID
    },
    "Commands" : process.env.COMMANDS.split(","),
    "LangDefault": process.env.LANG_DEFAULT,
    "Langs": process.env.LANGS.split(",")
}

/** Command list */
const commands = {
    loop: {
        response: (userData, argument, channel) => {
            userLoop(userData, channel);
        }
    },
    pallet: {
        response: (userData) => {
            if(checkLoopTimes(userData)) dropPallet(userData);
        }
    },
    langs: {
        response: (userData) => {
            let langs = settings.Langs;
            let msg = '';
            langs.forEach(function(lang, index) {
                msg += '"' + lang + '"';

                if(index !== (langs.length - 1)){
                    msg += ', ';
                }
            });
            getMsg(userData, "langs_available", msg);
        }
    },
    setlang: {
        response: (userData, argument) => changeLang(argument, userData)
    },
    author: {
        response: (userData) => getMsg(userData, "author")
    },
    help: {
        response: (userData) => {
            var cmds = getCommands();
            getMsg(userData, "help", cmds);
        }
    },
    commands: {
        response: (userData) => {
            var cmds = getCommands();
            getMsg(userData, "commands", cmds);
        }
    }
}

const getCommands = () => {
    let listCommands = [];
    Object.keys(commands).forEach(function(key, index) {
        listCommands.push("d!" + key);
    });
    
    return listCommands.join(', ');
}

/** Firebase */
firebase.initializeApp(settings.Firebase);
let database = firebase.database();

let channelsDB = [];
database.ref("channels/").on("value", function(snapshot) {
    snapshot.forEach(function(childSnapshot) {
        channelsDB.push(childSnapshot.val());
    });
}, errorObject => {
    console.log(errorObject.code);
});

/** Twitch Functions */
const twitchClient = new tmi.client({
    "options": {"debug": true},
    "connection": {"secure": true, "reconnect": true},
    "identity": {"username": settings.TwitchUser, "password": settings.TwitchAuth},
    "channels": channelsDB
});

twitchClient.connect();

twitchClient.on("connected", (address, port) => {
    console.log("Twitch Bot has started on port: " + port);
});

twitchClient.on("message", (channel, context, message, self) => {
    if(self || (message == null)) return;

    let username = context["display-name"];
    const [raw, command, argument] = message.match(regexpCommand);

    if(command){
        let userData = getUser(username);

        const { response } = commands[command] || {};
        response(userData, argument, channel);
    }

    return false;
});

/** General Functions */
const getPrefix = (message) => {
    if(message.indexOf("d!") != -1){
        return true;
    }

    return false;
}

const regexpCommand = new RegExp(/^d!([a-zA-Z0-9]+)(?:\W+)?(.*)?/);

const changeLang = (lang, userData) => {
    if(!settings.Langs.includes(lang)){
        getMsg(userData, "lang_not_found");
        return false;
    }
    
    userData.lang = lang;
    saveUser(userData, 'changeLang');
    getMsg(userData, "lang_changes");
}

const getMsg = (userData, msg, aditional) => {
    let lang = require('./lang/' + userData.lang + '.json');
    let msgChat = lang[msg].replace("{username}", userData.username);

    if(!aditional){
        aditional = '';
    } else {
        msgChat = msgChat.replace("{aditional}", aditional);
    }
    
    twitchClient.say(userData.channel, msgChat);
}

/** Loop Functions */
const getLoop = (username, channel) => {
    let thisDate = new Date().getTime();
    let loopId;
    let loop = {};
    let loopData = {
        "username": username,
        "channel" : channel,
        "times": 0,
        "hit": false,
        "pallet": false,
        "luck" : parseFloat(settings.Luck),
        "status" : false,
        "created": thisDate,
        "closed": false
    };

    database.ref('loops').orderByChild('username').equalTo(username).on('child_added', (snapshot) => {
        console.log('achou:', snapshot.key);
        if(snapshot){
            loopId = snapshot.key;
            loopData = snapshot.val();
        }
    }, (errorObject) => {
        console.log('The read failed: ' + errorObject.name);
    });

    loopData.updated = thisDate;

    if(!loopId){
        loop = saveLoop(loopData, 'startBot');
    } else {
        loop[loopId] = loopData;
    }

    return loop;
}

const userLoop = (userData, channel) => {
    let loop = getLoop(userData.username, channel);
    let loopData = {};
    let loopId;

    Object.keys(loop).forEach(key => {
        loopId = key;
        loopData = loop[key];
    });

    /*if(Math.random() >= settings.Luck){
        userHit(loop.username);
        return false;
    }*/

    let times = loopData.times;
    loopData.times = (times + 1);

    let luck = loopData.luck;
    loopData.luck = (luck + 0.02);

    getMsg(userData, "loop_sucess");
    saveLoop(loopData, 'userLoop', loopId);
    //saveUser(userData, 'userLoop');

    if(Math.random() < userData.luck){
        userWin(userData);
    }
}

const saveLoop = (loopData, msg, loopId = null) => {
    loopData.updated = new Date().getTime();
    let loop = {};

    if(!loopId){
        loopId = database.ref('loops').push().getKey();
    }
        
    database.ref('loops').child(loopId).set(loopData, function(error) {
        if (error) {
            console.log(msg + ": Failed with error: " + error)
        } else {
            console.log(msg + ": Loop saved!");
        }
    });

    loop[loopId] = loopData;
    return loop;
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
    //saveUser(userData, 'userHit');
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

/** User functions */
const saveUser = (userData, msg) => {
    userData.updated = new Date().getTime();

    database.ref("users/" + userData.username).set(userData, function(error) {
        if (error) {
            console.log(msg + ": Failed with error: " + error)
        } else {
            console.log(msg + ": User saved!");
        }
    });
}

const getUser = (username) => {
    let thisDate = new Date().getTime();
    let userData = {
        "username": username,
        "lang": settings.LangDefault,
        "created": thisDate
    };
    
    database.ref('users/' + username).on('value', function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            userData[childSnapshot.key] = childSnapshot.val();
        });
    });

    userData.updated = thisDate;
    saveUser(userData, 'startBot');
    return userData;
}

const delUser = (username) => {
    database.ref('users/' + username).remove();
    return false;
}

const userWin = (userData) => {
    getMsg(userData, "win");
    userData.closed = new Date().getTime();
    saveUser(userData);
    //delUser(userData.username);
    return false;
}

const userDie = (userData) => {
    getMsg(userData, "died");
    userData.closed = new Date().getTime();
    saveUser(userData);
    //delUser(userData.username);
    return false;
}