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
        response: (userData) => {
            if(checkLoopTimes(userData)) userLoop(userData);
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
    return Object.keys(commands).join(', ');
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

const getUser = (username, channel) => {
    let thisDate = new Date().getTime();
    let userData = {
        "username": username,
        "lang": settings.LangDefault,
        "channel" : channel,
        "times": 0,
        "hit": false,
        "pallet": false,
        "luck" : settings.Luck,
        "created": thisDate
    };
    
    database.ref('loops/' + username).on('value', function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            userData[childSnapshot.key] = childSnapshot.val();
        });
    });

    userData.updated = thisDate;
    saveUser(userData, 'startBot');
    return userData;
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
    if(self) return;

    if(message){
        let username = context["display-name"];

        const [raw, command, argument] = message.match(regexpCommand);

        if(command){
            let userData = getUser(username, channel); 
            const { response } = commands[command] || {};
            response(userData, argument);
        }
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