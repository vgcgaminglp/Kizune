const botSettings = require("./token.json");
const Discord = require("discord.js");
const fs = require("fs");
const ytdl = require("ytdl-core");
const Util = require('discord.js');
const YouTube = require('simple-youtube-api');
const prefix = botSettings.prefix;
const youtube = new YouTube("AIzaSyApcvSZ3rmGqhGwhnHi0GAdKfy4HvzpH-U");
const queue = new Map();


//Coded and created by Marques Scripps 21/08/2018

const bot = new Discord.Client({disabledEveryone: true});
bot.commands = new Discord.Collection();

var servers = {};

fs.readdir("./commands/", (err, files) => {
    if(err) console.error(err);

    let jsfiles = files.filter(f => f.split(".").pop() === "js");
    if(jsfiles.length <= 0) {
        console.log("No commands to load!");
        return;
    }

    jsfiles.forEach((f,i) => {
        let props = require(`./commands/${f}`);
        console.log(`${f} loaded!`);
        bot.commands.set(props.help.name, props);
    });
});

bot.on("ready", async () => {
    console.log(`${bot.user.username} is online on ${bot.guilds.size} servers!`);
    bot.user.setGame("on " + `${bot.guilds.size}` + " Servers || !help");

    try {
        let link = await bot.generateInvite(["ADMINISTRATOR"]);
        console.log(link);
    } catch(e) {
        console.log(e.stack);
    }
    

    bot.on('message', async msg => { // eslint-disable-line
        if (msg.author.bot) return undefined;
        if (!msg.content.startsWith(prefix)) return undefined;
        
    
        const args = msg.content.split(' ');
        const searchString = args.slice(1).join(' ');
        const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
        const serverQueue = queue.get(msg.guild.id);
    
        let command = msg.content.toLowerCase().split(' ')[0];
        command = command.slice(prefix.length)
    
        if (command === 'play') {
            const voiceChannel = msg.member.voiceChannel;
            if (!voiceChannel) return             msg.channel.send({embed: {
                color: 14162525,
                author: {
                  name: bot.user.username,
                  icon_url: bot.user.avatarURL
                },
                title: "",
                description: "Hey! You don't seem to be a voice channel :broken_heart: ",
              }
            });
            const permissions = voiceChannel.permissionsFor(msg.client.user);
            if (!permissions.has('CONNECT')) {
                return msg.channel.send({embed: {
                    color: 14162525,
                    author: {
                      name: bot.user.username,
                      icon_url: bot.user.avatarURL
                    },
                    title: "",
                    description: "I cannot connect to this voice channel, make sure I have the proper permissions! :broken_heart: ",
                  }
                })
            }
            if (!permissions.has('SPEAK')) {
                return msg.channel.send({embed: {
                    color: 14162525,
                    author: {
                      name: bot.user.username,
                      icon_url: bot.user.avatarURL
                    },
                    title: "",
                    description: "I cannot speak to this voice channel, make sure I have the proper permissions! :broken_heart: ",
                  }
                })
            }
            if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
                const playlist = await youtube.getPlaylist(url);
                const videos = await playlist.getVideos();
                for (const video of Object.values(videos)) {
                    const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
                    await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
                }
                return msg.channel.send({embed: {
                    color: 14162525,
                    author: {
                      name: bot.user.username,
                      icon_url: bot.user.avatarURL
                    },
                    title: "",
                    description: "✅ Playlist: **${playlist.title}** has been added to the queue! :heart: ",
                  }
                }) 
            } else {
                try {
                    var video = await youtube.getVideo(url);
                } catch (error) {
                    try {
                        var videos = await youtube.searchVideos(searchString, 10);
                        let index = 0;
                        msg.channel.send(`
    __**Song selection:**__
    
    ${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
    
    Please provide a value to select one of the search results ranging from 1-10.
                        `);
                        // eslint-disable-next-line max-depth
                        try {
                            var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                                maxMatches: 1,
                                time: 10000,
                                errors: ['time']
                            });
                        } catch (err) {
                            console.error(err);
                            return msg.channel.send('No or invalid value entered, cancelling video selection.');
                        }
                        const videoIndex = parseInt(response.first().content);
                        var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
                    } catch (err) {
                        console.error(err);
                        return msg.channel.send('🆘 I could not obtain any search results.');
                    }
                }
                return handleVideo(video, msg, voiceChannel);
            }
        } else if (command === 'skip') {
            if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
            if (!serverQueue) return msg.channel.send('There is nothing playing that I could skip for you.');
            serverQueue.connection.dispatcher.end('Skip command has been used!');
            return undefined;
        } else if (command === 'stop') {
            if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
            if (!serverQueue) return msg.channel.send('There is nothing playing that I could stop for you.');
            serverQueue.songs = [];
            serverQueue.connection.dispatcher.end('Stop command has been used!');
            return undefined;
        } else if (command === 'volume') {
            if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
            if (!serverQueue) return msg.channel.send('There is nothing playing.');
            if (!args[1]) return msg.channel.send(`The current volume is: **${serverQueue.volume}**`);
            serverQueue.volume = args[1];
            serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
            return msg.channel.send(`I set the volume to: **${args[1]}**`);
        } else if (command === 'np') {
            if (!serverQueue) return msg.channel.send('There is nothing playing.');
            return msg.channel.send(`🎶 Now playing: **${serverQueue.songs[0].title}**`);
        } else if (command === 'queue') {
            if (!serverQueue) return msg.channel.send('There is nothing playing.');
            return msg.channel.send(`
    __**Song queue:**__
    
    ${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
    
    **Now playing:** ${serverQueue.songs[0].title}
            `);
        } else if (command === 'pause') {
            if (serverQueue && serverQueue.playing) {
                serverQueue.playing = false;
                serverQueue.connection.dispatcher.pause();
                return msg.channel.send('⏸ Paused the music for you!');
            }
            return msg.channel.send('There is nothing playing.');
        } else if (command === 'resume') {
            if (serverQueue && !serverQueue.playing) {
                serverQueue.playing = true;
                serverQueue.connection.dispatcher.resume();
                return msg.channel.send('▶ Resumed the music for you!');
            }
            return msg.channel.send('There is nothing playing.');
        } else if (command === "help") {
            msg.channel.send({embed: {
                color: 14162525,
                author: {
                  name: bot.user.username,
                  icon_url: bot.user.avatarURL
                },
                title: "[Website]",
                url: "https://mscripps.me/yukine",
                description: "Hey! My name is Yukine! You can find more information on my commands :heart:",
                fields: [{
                    name: "Commands",
                    value: "Below are some of the commands that I can do :)",
                    inline : true
                  },
                  {
                    name: "MUSIC",
                    value: "``!play``" + `,` + "``!stop``" + `,` + "``!skip``" + `,` + "``!volume``" + `,` + "``!np``" + `,` + "``!pause``" + `,` + "``!resume``",
                    inline: false
                  },
                  {
                    name: "FUN",
                    value: "``!bigtext``" + `,` + "``!bigtextd``" + `,` + "``!f``" + `,` + "``!flipcoin``" + `,` + "``!8ball``" + `,` + "``!fortune``" + `,` + "``!lenny``" + `,` + "``!say``" + `,` + "``!shrug``",
                    inline: false
                  },
                  {
                    name: "IMAGES",
                    value: "``!bigtext``" + `,` + "``!bigtextd``" + `,` + "``!f``" + `,` + "``!flipcoin``" + `,` + "``!8ball``" + `,` + "``!fortune``" + `,` + "``!lenny``" + `,` + "``!say``" + `,` + "``!shrug``",
                    inline: false
                  },
                  {
                    name: "GUILD",
                    value: "``!bigtext``" + `,` + "``!bigtextd``" + `,` + "``!f``" + `,` + "``!flipcoin``" + `,` + "``!8ball``" + `,` + "``!fortune``" + `,` + "``!lenny``" + `,` + "``!say``" + `,` + "``!shrug``",
                    inline: false
                  },
                  {
                    name: "BOTLIST",
                    value: "``!bigtext``" + `,` + "``!bigtextd``" + `,` + "``!f``" + `,` + "``!flipcoin``" + `,` + "``!8ball``" + `,` + "``!fortune``" + `,` + "``!lenny``" + `,` + "``!say``" + `,` + "``!shrug``",
                    inline: false
                  },                  
                ],
                footer: {
                  icon_url: bot.user.avatarURL,
                  text: "© Kizune"
                }
              }
            });
        } else if (command === "myinfo") {
            let embed = new Discord.RichEmbed()
            .setAuthor(msg.author.username)
            .setDescription("This is you're info!")
            .setColor("#FC7255")
            .addField("Full Username: ", `${msg.author.username}#${msg.author.discriminator}`)
            .addField("ID", msg.author.id)
            .addField("Created At: ", msg.author.createdAt)
            .setFooter(bot.user.username);
            msg.channel.sendEmbed(embed);
        } else if (comamnd === "invite") {
            let link = await bot.generateInvite(["ADMINISTRATOR"]);
            let embed = new Discord.RichEmbed()
            .setAuthor(msg.author.username)
            .setDescription("This is you're info!")
            .setColor("#FC7255")
            .setField("Invite code: " + link)
            .setFooter(bot.user.username);
            msg.channel.sendEmbed(embed);
        }
    
        return undefined;
    });
    
    async function handleVideo(video, msg, voiceChannel, playlist = false) {
        const serverQueue = queue.get(msg.guild.id);
        console.log(video);
        const song = {
            id: video.id,
            title: Util.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`
        };
        if (!serverQueue) {
            const queueConstruct = {
                textChannel: msg.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };
            queue.set(msg.guild.id, queueConstruct);
    
            queueConstruct.songs.push(song);
    
            try {
                var connection = await voiceChannel.join();
                queueConstruct.connection = connection;
                play(msg.guild, queueConstruct.songs[0]);
            } catch (error) {
                console.error(`I could not join the voice channel: ${error}`);
                queue.delete(msg.guild.id);
                return msg.channel.send(`I could not join the voice channel: ${error}`);
            }
        } else {
            serverQueue.songs.push(song);
            console.log(serverQueue.songs);
            if (playlist) return undefined;
            else return msg.channel.send({embed: {
                color: 14162525,
                author: {
                  name: bot.user.username,
                  icon_url: bot.user.avatarURL
                },
                title: "",
                description: "✅ I've added that to the queue! :heart: ",
              }
            }) 
        }
        return undefined;
    }
    
    function play(guild, song) {
        const serverQueue = queue.get(guild.id);
    
        if (!song) {
            serverQueue.voiceChannel.leave();
            queue.delete(guild.id);
            return;
        }
        console.log(serverQueue.songs);
    
        const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
            .on('end', reason => {
                if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
                else console.log(reason);
                serverQueue.songs.shift();
                play(guild, serverQueue.songs[0]);
            })
            .on('error', error => console.error(error));
        dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    
        serverQueue.textChannel.send(`🎶 Start playing: **${song.title}**`);
    }
    

    
});
bot.login(botSettings.token);