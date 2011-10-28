
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const DBus = imports.dbus;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;

/* global values */
let icon_path = null;
let compatible_players = null;
let support_seek = null;
let coverpathmusic = null;
let coverpathpause = null;
let coverpathplay = null;
let preferences_path = null;
let default_setup = "";
let MusicEnabled = null;
let MusicIndicators = []; 
let MusicSources = []; 
let MusicNotifications = []; 
let MusicPlayersList = [];


//*********************************
//DBUS MPRIS components and objects
//*********************************
const PropIFace = {
    name: 'org.freedesktop.DBus.Properties',
    signals: [{ name: 'PropertiesChanged',
                inSignature: 'a{sv}'}]
};

const MediaServer2IFace = {
    name: 'org.mpris.MediaPlayer2',
    methods: [{ name: 'Raise',
                inSignature: '',
                outSignature: '' },
              { name: 'Quit',
                inSignature: '',
                outSignature: '' }],
    properties: [{ name: 'CanRaise',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanQuit',
                   signature: 'b',
                   access: 'read'}],
};

const MediaServer2PlayerIFace = {
    name: 'org.mpris.MediaPlayer2.Player',
    methods: [{ name: 'PlayPause',
                inSignature: '',
                outSignature: '' },
              { name: 'Pause',
                inSignature: '',
                outSignature: '' },
              { name: 'Play',
                inSignature: '',
                outSignature: '' },
              { name: 'Stop',
                inSignature: '',
                outSignature: '' },
              { name: 'Next',
                inSignature: '',
                outSignature: '' },
              { name: 'Previous',
                inSignature: '',
                outSignature: '' },
              { name: 'SetPosition',
                inSignature: 'a{ov}',
                outSignature: '' }],
    properties: [{ name: 'Metadata',
                   signature: 'a{sv}',
                   access: 'read'},
                 { name: 'Shuffle',
                   signature: 'b',
                   access: 'readwrite'},
                 { name: 'Rate',
                   signature: 'd',
                   access: 'readwrite'},
                 { name: 'LoopStatus',
                   signature: 'b',
                   access: 'readwrite'},
                 { name: 'Volume',
                   signature: 'd',
                   access: 'readwrite'},
                 { name: 'PlaybackStatus',
                   signature: 's',
                   access: 'read'},
                 { name: 'Position',
                   signature: 'x',
                   access: 'read'},
                 { name: 'CanGoNext',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanGoPrevious',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanPlay',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanPause',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanSeek',
                   signature: 'b',
                   access: 'read'}],
    signals: [{ name: 'Seeked',
                inSignature: 'x' }]
};

function Prop() {
    this._init.apply(this, arguments);
}

Prop.prototype = {
    _init: function(owner) {
        DBus.session.proxifyObject(this, owner, '/org/mpris/MediaPlayer2', this);
    }
}
DBus.proxifyPrototype(Prop.prototype, PropIFace)

function MediaServer2() {
    this._init.apply(this, arguments);
}

MediaServer2.prototype = {
    _init: function(owner) {
        DBus.session.proxifyObject(this, owner, '/org/mpris/MediaPlayer2', this);
    },
    getRaise: function(callback) {
        this.GetRemote('CanRaise', Lang.bind(this,
            function(raise, ex) {
                if (!ex)
                    callback(this, raise);
            }));
    }
}
DBus.proxifyPrototype(MediaServer2.prototype, MediaServer2IFace)

function MediaServer2Player() {
    this._init.apply(this, arguments);
}

MediaServer2Player.prototype = {
    _init: function(owner) {
        this._owner = owner;
        DBus.session.proxifyObject(this, owner, '/org/mpris/MediaPlayer2', this);
    },
    getMetadata: function(callback) {
        this.GetRemote('Metadata', Lang.bind(this,
            function(metadata, ex) {
                if (!ex)
                    callback(this, metadata);
            }));
    },
    getPlaybackStatus: function(callback) {
        this.GetRemote('PlaybackStatus', Lang.bind(this,
            function(status, ex) {
                if (!ex)
                    callback(this, status);
            }));
    },
    getRate: function(callback) {
        this.GetRemote('Rate', Lang.bind(this,
            function(rate, ex) {
                if (!ex)
                    callback(this, rate);
            }));
    },
    getPosition: function(callback) {
        this.GetRemote('Position', Lang.bind(this,
            function(position, ex) {
                if (!ex)
                    callback(this, position);
            }));
    },
    getShuffle: function(callback) {
        this.GetRemote('Shuffle', Lang.bind(this,
            function(shuffle, ex) {
                if (!ex)
                    callback(this, shuffle);
            }));
    },
    setShuffle: function(value) {
        this.SetRemote('Shuffle', value);
    },
    getVolume: function(callback) {
        this.GetRemote('Volume', Lang.bind(this,
            function(volume, ex) {
                if (!ex)
                    callback(this, volume);
            }));
    },
    setVolume: function(value) {
        this.SetRemote('Volume', parseFloat(value));
    },
    getRepeat: function(callback) {
        this.GetRemote('LoopStatus', Lang.bind(this,
            function(repeat, ex) {
                if (!ex) {
                    if (repeat == "None")
                        repeat = false
                    else
                        repeat = true
                    callback(this, repeat);
                }
            }));
    },
    setRepeat: function(value) {
        if (value)
            value = "Playlist"
        else
            value = "None"
        this.SetRemote('LoopStatus', value);
    }
}
DBus.proxifyPrototype(MediaServer2Player.prototype, MediaServer2PlayerIFace)


//*********************************
//Music Integration Box components and objects
//*********************************
function ControlButton() {
    this._init.apply(this, arguments);
}

ControlButton.prototype = {
    _init: function(icon, isize, callback) {
        this.actor = new St.Bin({style_class: 'button-container'});
        this.button = new St.Button({ style_class: 'button-control' });
        this.button.connect('clicked', callback);
        this.icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            icon_name: icon,
            icon_size: isize,
            style_class: 'button-icon',
        });
        this.button.set_child(this.icon);
        this.actor.add_actor(this.button);

    },
    getActor: function() {
        return this.actor;
    },
    setIcon: function(icon) {
        this.icon.icon_name = icon;
    }
}

/* Coverart object
 *  for embedding the music art of songs
 *  inside the player automatically.
 *
 * @param owner: Player owner.
 * @param coversize: Int size of the cover.
 * @param overlay: Boolean show the overlay.
 * @param styleprefix: String prefix attached to all style_class param.
 *
 */
function CoverArt() {
    this._init.apply(this, arguments);
}

CoverArt.prototype = {
    _init: function (owner, coversize, overlay, styleprefix) {
        this._owner = owner;
        this._name = this._owner.split('.')[3];
        this._mediaServerPlayer = new MediaServer2Player(owner);
        this._mediaServer = new MediaServer2(owner);
        this._prop = new Prop(owner);
        this._cs = coversize;
        this._update = true;
        this._overlay = support_seek.indexOf(this._name) == -1 ? false : overlay;
        this._olh = 0.85;
	    this._oldCover = "";

        //Actual Cover Art
        this.actor = new St.BoxLayout({vertical: true, style_class: styleprefix + 'track-cover-control'});
        this.trackCover = new St.Bin({style_class: styleprefix + 'track-cover', x_align: St.Align.MIDDLE});
        this.trackCoverMusic = new Clutter.Texture({
            width: this._cs, 
            height: this._cs,
            keep_aspect_ratio: true, 
            filter_quality: 2, 
            filename: coverpathmusic
        })
        this.trackCover.set_child(this.trackCoverMusic);
        this.actor.add_actor(this.trackCover);

        if (this._overlay) {
            //Hover Area - aka the whole cover
            this._trackOverlay = new St.Button({style_class: 'track-overlay'});
            this.actor.add_actor(this._trackOverlay);
            this._trackOverlay.height = this._cs;
            this._trackOverlay.width = this._cs;
            this._trackOverlay.set_position(Math.floor(10), Math.floor(10));
            this._trackOverlay.set_opacity(0);

            //Pretty Play and Pause on the Cover
            this._trackOPpap = new Clutter.Texture({width: this._cs, height: this._cs, keep_aspect_ratio: true, filter_quality: 1, filename: coverpathpause});
            this.actor.add_actor(this._trackOPpap);
            this._trackOPpap.set_position(Math.floor(10), Math.floor(10));
            this._trackOPpap.set_opacity(0);

            //Track Background - the white area
            this._trackObg = new St.BoxLayout({vertical: true, style_class: 'track-overlay-bg'});
            this.actor.add_actor(this._trackObg);
            this._trackObg.height = this._cs - (this._cs*this._olh);
            this._trackObg.width = this._cs;
            this._trackObg.set_position(Math.floor(10), Math.floor(10 + (this._cs*this._olh)));

            //Track Timer - the black position bar
            this._trackOtimer = new St.BoxLayout({style_class: 'track-overlay-timer'});
            this._trackObg.add_actor(this._trackOtimer);
            this._trackOtimer.height = 2;
            this._trackOtimer.width = 0;
            this._trackOtimer.set_position(Math.floor(0), Math.floor(this._cs - (this._cs*this._olh) )-2);

            //Track Time - the text displaying the time left
            this._trackOtime = new St.Label({text: "0:00 / 0:00", style_class: 'track-overlay-time'});
            this._trackOtimeHolder = new St.Bin({x_align: St.Align.END});
            this._trackOtimeHolder.add_actor(this._trackOtime);
            this._trackObg.add_actor(this._trackOtimeHolder);

            this._trackOverlay.connect('notify::hover', 
                Lang.bind(this, function () {this._onEnterOverlay(this._trackOverlay, this._trackObg); }));
            this._trackOverlay.connect('clicked', 
                Lang.bind(this, function () { this._coverClick(); }));
            this._trackObg.set_opacity(0)
        }

        if (this._overlay) {
            this._getMetadata();
            this._currentTime = 0;
            this._songLength = 0;
            this._status = "";
            this._getPosition();
            this._getStatus();
            this._updateTimer();
            this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
                if (value["Metadata"]) 
                    this._setMetadata(iface, value["Metadata"]);
                if (value["PlaybackStatus"])
                    this._setStatus(iface, value["PlaybackStatus"]);
            }));
            this._mediaServerPlayer.connect('Seeked', Lang.bind(this, function(sender, value) {
                this._getPosition();
            }));
        }
			
        if (this._update) {
            this._getCover();
            this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
                if (value["Metadata"] && this._update)
                    this._setCover(iface, value["Metadata"]);
            }));
        }
    },

    _onEnterOverlay: function(hoverp, obj) {
        if (hoverp.hover) {
            Mainloop.source_remove(this._fadeoverlay);
            Tweener.addTween(obj, { time: 0.2,
                                    opacity: 255,
                                    transition: 'linear' });
        }
        else {
            this._fadeoverlay = Mainloop.timeout_add(750, Lang.bind(this, function () {
                Tweener.addTween(obj, { time: 0.2,
                                        opacity: 0,
                                        transition: 'linear' });
            }));
        }
    },

    getActor: function() {
        return this.actor;
    },

    _setUpdate: function (update) {
        this._update = update;
        if (update) this._getCover();
    },

    _coverClick: function () {
        this._mediaServerPlayer.PlayPauseRemote();
        this._trackOverlay.set_opacity(255);
        this._trackOPpap.set_opacity(155);
        Tweener.addTween(this._trackOverlay, { time: 1,
                                 opacity: 0,
                                 transition: 'linear' });
        Tweener.addTween(this._trackOPpap, { time: 1,
                                 opacity: 0,
                                 transition: 'linear' });
        if (this._status == "Playing") this._trackOPpap.filename = coverpathpause;
        else if (this._status == "Paused") this._trackOPpap.filename = coverpathplay;
        else if (this._status == "Stopped") this._trackOPpap.filename = coverpathplay;
    },

    _setPosition: function(sender, value) {
        this._stopTimer();
        this._currentTime = value / 1000000;
        this._runTimer();
    },

    _getPosition: function() {
        this._mediaServerPlayer.getPosition(Lang.bind(this, 
            this._setPosition
        ));
    },

    _setCover: function(sender, metadata) {
        if (metadata["mpris:artUrl"]) {
            let cover = metadata["mpris:artUrl"].toString();
            cover = decodeURIComponent(cover.substr(7));
            if (! GLib.file_test(cover, GLib.FileTest.EXISTS)) {
                this.trackCoverMusic.filename = coverpathmusic;
            }
            else {
			   if (cover != this._oldcover) {
				    this.trackCoverMusic.filename = cover;
					this._oldcover = cover;
				}
            }
        }
        else{
            this.trackCoverMusic.filename = coverpathmusic;
        }
    },

    _getCover: function() {
        this._mediaServerPlayer.getMetadata(Lang.bind(this,
            this._setCover
        ));
    },

    _setMetadata: function(sender, metadata) {
        if (metadata["mpris:length"]) {
            // song length in secs
            this._songLength = metadata["mpris:length"] / 1000000;
            // FIXME upstream
            if (this._name == "quodlibet")
                this._songLength = metadata["mpris:length"] / 1000;
            // reset timer
            this._stopTimer();
            this._runTimer();
        }
        else {
            this._songLength = 0;
            this._stopTimer();
        }
    },

    _getMetadata: function() {
        this._mediaServerPlayer.getMetadata(Lang.bind(this,
            this._setMetadata
        ));
    },

    _setStatus: function(sender, status) {
        this._status = status;
        if (status == "Playing") {
            this._runTimer();
        }
        else if (status == "Paused") {
            this._pauseTimer(); 
        }
        else if (status == "Stopped") {
            this._stopTimer();
        }
    },

    _getStatus: function() {
        this._mediaServerPlayer.getPlaybackStatus(Lang.bind(this,
            this._setStatus
        ));
    },

    _updateRate: function() {
        this._mediaServerPlayer.getRate(Lang.bind(this, function(sender, rate) {
            this._rate = rate;
        }));
    },

    _updateTimer: function() {
        this._trackOtime.text = (this._formatTime(this._currentTime) + " / " + this._formatTime(this._songLength));
        var currentSongTime = Math.floor(this._currentTime) / Math.floor(this._songLength);
        if (currentSongTime >= 1) 
            this._trackOtimer.width = this._cs;
        else if (this._currentTime > 0)
            this._trackOtimer.width = currentSongTime * this._cs;
        else
            this._trackOtimer.width = 0;
    },

    _runTimer: function() {
        if (!Tweener.resumeTweens(this) && this._status == "Playing") {
            Tweener.addTween(this,
                { _currentTime: this._songLength, 
                  time: this._songLength - this._currentTime,
                  transition: 'linear',
                  onUpdate: Lang.bind(this, this._updateTimer) });
        }
        this._updateTimer();
    },

    _pauseTimer: function() {
        Tweener.pauseTweens(this);
    },

    _stopTimer: function() {
        Tweener.removeTweens(this);
        this._currentTime = 0;
        this._updateTimer();
    },

    _formatTime: function(s) {
        let ms = s * 1000;
        let msSecs = (1000);
        let msMins = (msSecs * 60);
        let msHours = (msMins * 60);
        let numHours = Math.floor(ms/msHours);
        let numMins = Math.floor((ms - (numHours * msHours)) / msMins);
        let numSecs = Math.floor((ms - (numHours * msHours) - (numMins * msMins))/ msSecs);
        if (numSecs < 10)
            numSecs = "0" + numSecs.toString();
        if (numMins < 10 && numHours > 0)
            numMins = "0" + numMins.toString();
        if (numHours > 0)
            numHours = numHours.toString() + ":";
        else
            numHours = "";
        return numHours + numMins.toString() + ":" + numSecs.toString();
    }
}


//*********************************
// Music Integration Box
//*********************************
/*  the core main player containing
 *  cover art, song info, and buttons.
 *
 * @param owner: Player owner.
 * @param coversize: Int. size of the cover.
 * @param overlay: Int. size of the buttons.
 * @param overlay: Boolean show the overlay for cover.
 * @param openbutton: String "preferences", "raise" include buttons
 * @param styleprefix: String prefix attached to all style_class param.
 *
 */
function MusicIntBox() {
    this._init.apply(this, arguments);
}

MusicIntBox.prototype = {
    _init: function (owner, coversize, buttonsize, overlay, openbutton, styleprefix) {  

        //DBus Stuff
        this._owner = owner;
        this._name = this._owner.split('.')[3];
        this._mediaServerPlayer = new MediaServer2Player(owner);
        this._mediaServer = new MediaServer2(owner);
        this._prop = new Prop(owner);

        //Actor that holds everything
        this.actor = new St.BoxLayout({style_class: styleprefix + 'track-box'});

        //Track CoverArt
        this._trackCoverArt = new CoverArt(owner, coversize, overlay, styleprefix);
        //Holders
        this._trackInfoHolder = new St.Bin({style_class: styleprefix + 'track-info-holder', y_align: St.Align.MIDDLE});
        this._trackControlHolder = new St.Bin({style_class: styleprefix + 'track-control-holder', x_align: St.Align.MIDDLE});
        this.actor.add_actor(this._trackCoverArt.getActor());
        this.actor.add_actor(this._trackInfoHolder);

        //Track Information
        this._infos = new St.BoxLayout({vertical: true, style_class: styleprefix + 'track-info'});
        this._title = new St.Label({text: 'Unknown Title', style_class: 'track-title'});
        this._infos.add_actor(this._title);
        this._artist = new St.Label({text: 'Unknown Artist'});
        this._infos.add_actor(this._artist);
        this._album = new St.Label({text: 'Unknown Album'});
        this._infos.add_actor(this._album);
        this._infos.add_actor(this._trackControlHolder);
        this._trackInfoHolder.set_child(this._infos);

        //Buttons
        this._raiseButton = new ControlButton('media-eject', 24,
            Lang.bind(this, function () { 
                Main.overview.hide();
                this._mediaServer.RaiseRemote(); 
                windows = global.get_window_actors();
                for (w = 0; w<windows.length; w++) {
					windowm = windows[w].get_meta_window()
					appm = windowm.get_wm_class().toLowerCase();
					if (appm == this._name) {
						Main.activateWindow(windowm);
						break;
					}
				}
            }));
        this._spaceButton = new St.Bin({style_class: 'spaceb'});
        this._prevButton = new ControlButton('media-skip-backward', buttonsize,
            Lang.bind(this, function () { this._mediaServerPlayer.PreviousRemote(); }));
        this._playButton = new ControlButton('media-playback-start', buttonsize,
            Lang.bind(this, function () { this._mediaServerPlayer.PlayPauseRemote(); }));
        this._nextButton = new ControlButton('media-skip-forward', buttonsize,
            Lang.bind(this, function () { this._mediaServerPlayer.NextRemote(); }));
        this._spaceButtonTwo = new St.Bin({style_class: 'spaceb'});
        this._settButton = new ControlButton('system-run', buttonsize - 2,
            Lang.bind(this, function () { this._openPreferences(); }));

        this.controls = new St.BoxLayout();
        if (openbutton == "raise") {
            this.controls.add_actor(this._raiseButton.getActor());
            this.controls.add_actor(this._spaceButton);
        }
        this.controls.add_actor(this._prevButton.getActor());
        this.controls.add_actor(this._playButton.getActor());
        this.controls.add_actor(this._nextButton.getActor());
        if (openbutton == "preferences") {
            this.controls.add_actor(this._spaceButtonTwo);
            this.controls.add_actor(this._settButton.getActor());
        }
        this._trackControlHolder.set_child(this.controls);

        //Update and start listening
        this._getStatus();
        this._getMetadata();

        this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
            if (value["PlaybackStatus"])
                this._setStatus(iface, value["PlaybackStatus"]);
            if (value["Metadata"])
                this._setMetadata(iface, value["Metadata"]);
        }));
    },

    getActor: function() {
        return this.actor;
    },

    _openPreferences: function() {
        Main.overview.hide();
        Util.spawn([preferences_path]);
    },

    _setStatus: function(sender, status) {
        this._playerStatus = status;
        if (status == "Playing") {
            this._playButton.setIcon("media-playback-pause");
        }
        else if (status == "Paused") {
            this._playButton.setIcon("media-playback-start");
        }
        else if (status == "Stopped") {
            this._playButton.setIcon("media-playback-start");
        }
    },

    _getStatus: function() {
        this._mediaServerPlayer.getPlaybackStatus(Lang.bind(this,
            this._setStatus
        ));
    },

    _setMetadata: function(sender, metadata) {
        if (metadata["xesam:artist"]) this._artist.text = metadata["xesam:artist"].toString();
            else this._artist.text = "Artist";
        if (metadata["xesam:album"]) this._album.text = metadata["xesam:album"].toString();
            else this._album.text = "Album";
        if (metadata["xesam:title"]) this._title.text = metadata["xesam:title"].toString();
            else this._title.text = "Title";
    },

    _getMetadata: function() {
        this._mediaServerPlayer.getMetadata(Lang.bind(this,
            this._setMetadata
        ));
    }
}


//*********************************
//Indicator components and Objects
//*********************************
function IconImage() {
    this._init.apply(this, arguments);
}

IconImage.prototype = {
    _init: function(icon, image) {
        if (icon && !image) {
            this.actor = new St.Icon({
                icon_type: St.IconType.SYMBOLIC,
                icon_size: 12,
                icon_name: icon
            });
        }
        else if (image && !icon) {
            this.actor = new Clutter.Texture({
                height: 12, 
                keep_aspect_ratio: true, 
                filename: icon_path + image + ".svg"
            });
        }
        else if (image && icon){
            this.actor = new St.BoxLayout();
            this._icon = new St.Icon({
                icon_type: St.IconType.SYMBOLIC,
                icon_size: 12,
                icon_name: icon
            });
            this._img = new Clutter.Texture({
                height: 12, 
                keep_aspect_ratio: true, 
                filename: icon_path + image + ".svg"
            });
            this.actor.add_actor(this._icon);
            this.actor.add_actor(this._img);
            this._img.set_position(3,0);
        }
        else {
            this.actor = new Clutter.Texture({
                height: 12, 
                width: 12, 
                keep_aspect_ratio: true, 
                filename: coverpathmusic
            });
        }
    },

    setIcon: function(icon) {
        this._imgicon.icon_name = icon;
    },

    setImage: function(image) {
        this._imgicon.filename = icon_path + image + ".svg";
    },

    setIconImage: function(icon, image) {
        this._icon.icon_name = icon;
        this._img.filename = icon_path + image + ".svg";
    },
    
    getActor: function() {
        return this.actor;
    }
}


function TextImageItem() {
    this._init.apply(this, arguments);
}

TextImageItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, icon, image, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this._imgicon = new IconImage(icon, image);
        this.addActor(this._imgicon.getActor(), {span: 1});

        this._label = new St.Label({text: text, style_class: "label-class"});
        this.addActor(this._label, {span: 0});
    },

    setText: function(text) {
        this._label.text = text;
    },

    setIcon: function(icon) {
        this._imgicon.setIcon(icon);
    },

    setImage: function(image) {
        this._imgicon.setImage(image);
    },

    setIconImage: function(icon, image) {
        this._imgicon.setIconImage(icon, image);
    }
}

function VolSliderItem() {
    this._init.apply(this, arguments);
}

VolSliderItem.prototype = {
    __proto__: PopupMenu.PopupSliderMenuItem.prototype,

    _init: function(text, icon, style, value) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

        this._icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 12,
            icon_name: icon,
            style_class: 'icon-volume'});
        this.addActor(this._icon, {span: 1});

        this._label = new St.Label({text: text, style_class: "label-class"});
        this.addActor(this._label, {span: 1});

        this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));

        if (isNaN(value))
            // Avoid spreading NaNs around
            throw TypeError('The slider value must be a number');
        this._value = Math.max(Math.min(value, 1), 0);

        this._slider = new St.DrawingArea({ style_class: 'popup-slider-menu-item', reactive: true });
        this.addActor(this._slider, { span: -1, expand: true });
        this._slider.connect('repaint', Lang.bind(this, this._sliderRepaint));
        this.actor.connect('button-press-event', Lang.bind(this, this._startDragging));
        this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));

        this._releaseId = this._motionId = 0;
        this._dragging = false;
    },

    setIcon: function(icon) {
        this._icon.icon_name = icon;
    }
}


function ToggleItem() {
    this._init.apply(this, arguments);
}

ToggleItem.prototype = {
    __proto__: PopupMenu.PopupSwitchMenuItem.prototype,

    _init: function(text, icon, active, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this._icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 12,
            icon_name: icon});
        this._iconbox = new St.Bin();
        this._iconbox.add_actor(this._icon);
        this.addActor(this._iconbox, {span: 1});

        this.label = new St.Label({ text: text, style_class: "label-class" });
        this._switch = new PopupMenu.Switch(active);

        this.addActor(this.label, {span: 1});
        this.addActor(this._switch.actor, { span: -1, expand: false, align: St.Align.END });

        this.updateIcon();
    },

    updateIcon: function() {
        if (this._switch.state) this._iconbox.set_opacity(255);
        else this._iconbox.set_opacity(100);
    },

    activate: function () {
        this.toggle();
        this.updateIcon();
    },

    setToggleState: function(state) {
        this._switch.setToggleState(state);
        this.updateIcon();
    }
}

/* Music Menu
 *  the main popup menu containing cover art,
 *  song info, buttons, and more settings.
 *
 */
function MusicMenu() {
    this._init.apply(this, arguments);
}

MusicMenu.prototype = {
    __proto__: PopupMenu.PopupMenuSection.prototype,
    
    _init: function(owner) {
        PopupMenu.PopupMenuSection.prototype._init.call(this);

        //DBus Stuff
        this._owner = owner;
        this._name = this._owner.split('.')[3];
        this._mediaServerPlayer = new MediaServer2Player(owner);
        this._mediaServer = new MediaServer2(owner);
        this._prop = new Prop(owner);

        //Player Title
        this._playerTitle = new TextImageItem(this._getName(), "audio-x-generic",  "music-stopped", {style_class: "player-title", reactive: false});
        this.addMenuItem(this._playerTitle);

        //Main Music Box
        this._mainMusicBox = new MusicIntBox(owner, 120, 26, true, "raise", "");
        this._mainMusicBox._infos.width = 300;
        this.addActor(this._mainMusicBox.getActor());

        //Volume
        this._volume = new VolSliderItem("Volume", "audio-volume-high", "volume-slider", 0);
        this._volume.connect('value-changed', Lang.bind(this, function(item) {
            this._mediaServerPlayer.setVolume(item._value);
        }));
        this.addMenuItem(this._volume);

        //Shuffle
        this._shuffle = new ToggleItem("Shuffle", "media-playlist-shuffle", true, {style_class: 'shuffleitem'});
        this._shuffle.connect('toggled', Lang.bind(this, function(item) {
            this._mediaServerPlayer.setShuffle(item.state);
            this._updateSwitches();
        }));
        this.addMenuItem(this._shuffle);

        //Repeat
        this._repeat = new ToggleItem("Repeat", "media-playlist-repeat", true, {style_class: 'repeatitem'});
        this._repeat.connect('toggled', Lang.bind(this, function(item) {
            this._mediaServerPlayer.setRepeat(item.state);
            this._updateSwitches();
        }));
        this.addMenuItem(this._repeat);

        //Music Integration Preferences
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._preferences = new TextImageItem("Music Integration Preferences", "system-run", false, {style_class: "system-preferences"});
        this._preferences.connect('activate', Lang.bind(this, function(item) {
            this._openPreferences();
        }));
        this.addMenuItem(this._preferences);

        //Update and start listening
        this._getStatus();
        this._updateSwitches();
        this._getVolume();

        this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
            this._updateSwitches();
            if (value["Volume"])
                this._setVolume(iface, value["Volume"]);
            if (value["PlaybackStatus"])
                this._setStatus(iface, value["PlaybackStatus"]);
        }));
    },

    _openPreferences: function() {
        Main.overview.hide();
        Util.spawn([preferences_path]);
    },

    _getName: function() {
        return this._name.charAt(0).toUpperCase() + this._name.slice(1);
    },

    _setName: function(status) {
        this._playerTitle.setText(this._getName() + " - " + _(status));
    },

    _updateSwitches: function() {
        this._mediaServerPlayer.getShuffle(Lang.bind(this,
            function(sender, shuffle) {
                this._shuffle.setToggleState(shuffle);
            }
        ));
        this._mediaServerPlayer.getRepeat(Lang.bind(this,
            function(sender, repeat) {
                this._repeat.setToggleState(repeat);
            }
        ));
    },

    _setVolume: function(sender, value) {
        if (value > 0)
            this._volume.setIcon("audio-volume-muted");
        if (value > 0.05)
            this._volume.setIcon("audio-volume-low");
        if (value > 0.30) 
            this._volume.setIcon("audio-volume-medium");
        if (value > 0.80)
            this._volume.setIcon("audio-volume-high");
        this._volume.setValue(value);
    },

    _getVolume: function() {
        this._mediaServerPlayer.getVolume(Lang.bind(this,
            this._setVolume
        ));
    },

    _setCoverUpdate: function(update) {
        this._mainMusicBox._trackCoverArt._setUpdate(update);
    },

    _setStatus: function(sender, status) {
        this._playerStatus = status;
        this._playerTitle.setIconImage('audio-x-generic', "music-" + status.toLowerCase());
        this._setName(status);
    },

    _getStatus: function() {
        this._mediaServerPlayer.getPlaybackStatus(Lang.bind(this,
            this._setStatus
        ));
    }
}

/* Music Indicator
 *  the actual indicator, that 
 *  holds the player popup menu.
 *
 */
function MusicIndicator() {
    this._init.apply(this, arguments);
}

MusicIndicator.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function(owner, p) {
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'audio-x-generic', null);

        //DBus stuff
        this._owner = owner;
        this._name = this._owner.split('.')[3];
        this._mediaServerPlayer = new MediaServer2Player(owner);
        this._mediaServer = new MediaServer2(owner);
        this._prop = new Prop(owner);
        this._pcount = p;

        //Icon in Panel
        this._newIconActor = new St.BoxLayout();
        this._icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 12,
            icon_name: 'audio-x-generic'
        });
        this._img = new Clutter.Texture({
            height: 12, 
            keep_aspect_ratio: true, 
            filename: icon_path + "music-stopped.svg"
        });
        this._newIconActor.add_actor(this._icon);
        this._newIconActor.add_actor(this._img);
        this._img.set_position(3,0);
        
        this.actor.remove_actor(this._iconActor);
        this.actor.add_actor(this._newIconActor);

        //MusicMenu player
        this._player = new MusicMenu(owner);
        this.menu.addMenuItem(this._player);
        this._player._setCoverUpdate(false);

        //Update and start listening
        this._getStatus();

        this._propchange = this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
            if (value["PlaybackStatus"])
                this._setStatus(iface, value["PlaybackStatus"]);
        }));
    },

    _setStatus: function(sender, status) {
        this._img.filename = icon_path + 'music-' + status.toLowerCase() + '.svg';
    },

    _getStatus: function() {
        this._mediaServerPlayer.getPlaybackStatus(Lang.bind(this,
            this._setStatus
        ));
    },

    _onOpenStateChanged: function(menu, open) {
        if (open) this.actor.add_style_pseudo_class('active');
        else this.actor.remove_style_pseudo_class('active');
        this._player._setCoverUpdate(open);
        if(MusicSources[this._pcount]) MusicSources[this._pcount]._setUpdate(!open);
    },
    
    getActor: function() {
		return this.actor;
	},
	
	getMenu: function() {
		return this.menu;
	},

    destroy: function() {
        this._prop.disconnect(this._propchange);
        this.actor._delegate = null;

        this.menu.destroy();
        this.actor.destroy();

        this.emit('destroy');
    }
};


//*********************************
//Notification components and objects
//*********************************

/* Music Notifications
 *  the notification itself, which 
 *  holds the title, banner, and musicbox.
 */
function MusicNotification(source, title, banner, params) {
    this._init(source, title, banner, params);
};

MusicNotification.prototype = {
    __proto__: MessageTray.Notification.prototype,

    _init: function(source, owner, title, banner, params) {
        this._name = owner.split('.')[3];
        MessageTray.Notification.prototype._init.call(this, source, title, banner, params);
        this._table.width = 460;
        this._mainHolder = new St.Bin({x_align: St.Align.START, style_class: "n-holder"});
        this._mainMusicBox = new MusicIntBox(owner, 83, 20, false, "preferences", "n-");
        this._mainMusicBox._infos.width = 260;
        this._mainHolder.set_child(this._mainMusicBox.getActor());
        this.addActor(this._mainHolder);
        this.enableScrolling(false);
    },

    _onClicked: function() {
        this._loadApp(this._name);
    },

    _setCoverUpdate: function(update) {
        this._mainMusicBox._trackCoverArt._setUpdate(update);
    },

    _loadApp: function(app) {
        this.emit('clicked');
        this.emit('done-displaying');
        Main.overview.hide();
        Util.spawn([app]);
        windows = global.get_window_actors();
        for (w = 0; w<windows.length; w++) {
		    windowm = windows[w].get_meta_window()
			appm = windowm.get_wm_class().toLowerCase();
			if (appm == this._name) {
				Main.activateWindow(windowm);
		    }
	    }
    }
};

/* Music Source
 *  the actual source, where 
 *  notifications report to
 */
function MusicSource() {
    this._init.apply(this, arguments);
}

MusicSource.prototype = {
    __proto__:  MessageTray.Source.prototype,

    _init: function(owner, p) { 

        //DBus Stuff
        this._owner = owner;
        this._name = this._owner.split('.')[3];
        this._mediaServerPlayer = new MediaServer2Player(owner);
        this._mediaServer = new MediaServer2(owner);
        this._prop = new Prop(owner);

        MessageTray.Source.prototype._init.call(this, this._getName() + " Integration");
        this._setSummaryIcon(this.createMusicIcon());

        this._pcount = p;
        this._update = true;
        this._focusnotify = true;
        this._songIcon = new St.Bin({style_class: 'song-icon'});

        //Update and start listening
        this._getMetadata();

        this._propchange = this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
	        if (value["Metadata"]) {
                windows = global.get_window_actors();
                for (w = 0; w<windows.length; w++) {
		            windowm = windows[w].get_meta_window()
					appm = windowm.get_wm_class().toLowerCase();
			        if (appm == this._name) {
			    	    if (windowm.has_focus()) {
							this._focusnotify = false;
							break;
						} else this._focusnotify = true;
		            }
		            else this._focusnotify = true
	            }
            }
	        if (value["Metadata"] && this._update) {
                this._setMetadata(iface, value["Metadata"]);
                if (this._focusnotify) this.notify(MusicNotifications[this._pcount]);
            }
        }));
        
    },

    _getName: function() {
        return this._name.charAt(0).toUpperCase() + this._name.slice(1);
    },

    _setMetadata: function(sender, metadata) {
		//Notification Title
		var artist, album, title;
        if (metadata["xesam:artist"]) artist = metadata["xesam:artist"].toString();
            else artist = "Artist";
        if (metadata["xesam:album"]) album = metadata["xesam:album"].toString();
            else album = "Album";
        if (metadata["xesam:title"]) title = metadata["xesam:title"].toString();
            else title = "Title";
        MusicNotifications[this._pcount].update(title,  "by " + artist + " from " + album, {
            customContent : true
        });
        
        //Notification Icon
        if (metadata["mpris:artUrl"]) {
            let cover = metadata["mpris:artUrl"].toString();
            cover = decodeURIComponent(cover.substr(7));
            if (! GLib.file_test(cover, GLib.FileTest.EXISTS))
                this._iconA.filename = coverpathmusic
            else {
                this._iconA.filename = cover
            }
        }
        else
            this._iconA.filename = coverpathmusic
    },

    _getMetadata: function() {
        this._mediaServerPlayer.getMetadata(Lang.bind(this,
            this._setMetadata
        ));
    },

    _setUpdate: function(update) {
        this._update = update;
        if(update) this._getMetadata();
        MusicNotifications[this._pcount]._setCoverUpdate(update);
    },

    createMusicIcon: function() {
        return new St.Icon({ icon_name: this._name,
                             icon_type: St.IconType.FULLCOLOR,
                             icon_size: 24 });
    },

    createNotificationIcon: function() {
        this._iconA = new Clutter.Texture({
            keep_aspect_ratio: true,
            width: this.ICON_SIZE,
            height: this.ICON_SIZE,
            filter_quality: 2, 
            filename: coverpathplay
        });
        this._songIcon.set_child(this._iconA);
        return this._songIcon;
    },

    destroy: function(reason) {
        this.emit('destroy', reason);
        this._prop.disconnect(this._propchange);
    }
}


//*********************************
//Player Functions: when a player is added, or removed
//*********************************
function addPlayer(owner) {
    let _children = Main.panel._rightBox.get_children();
    p = compatible_players.indexOf(owner.split('.')[3])
    
	MusicPlayersList[p] = true;
	if(default_setup == 1 || default_setup == 2) MusicIndicators[p] = new MusicIndicator(owner, p);
    if(default_setup == 1 || default_setup == 3) {
		MusicSources[p] = new MusicSource(owner, p);
        MusicNotifications[p] = new MusicNotification(MusicSources[p], owner, null, null, {
            customContent : true
        });
        MusicSources[p].pushNotification(MusicNotifications[p]);
	}
    
    if (MusicEnabled) {
	    if(default_setup == 1 || default_setup == 3) Main.messageTray.add(MusicSources[p]);
	    if(default_setup == 1 || default_setup == 2) {
			Main.panel._rightBox.insert_actor(MusicIndicators[p].getActor(), _children.length - 1);
	        Main.panel._menus.addMenu(MusicIndicators[p].getMenu());
	    }
	}
}
function removePlayer(owner) {
    p = compatible_players.indexOf(owner.split('.')[3])
    
	MusicPlayersList[p] = false;
    if (MusicIndicators[p]) MusicIndicators[p].destroy();
    if (MusicSources[p]) MusicSources[p].destroy();
    if (MusicNotifications[p]) MusicNotifications[p].destroy();
}


//*********************************
//Core functions: init, enable, disable
//*********************************
function init(metadata) {
    MusicEnabled = false;
    icon_path = metadata.path + '/icons/';
    coverpathmusic = metadata.path + '/music.png';
    coverpathpause = metadata.path + '/pause.png';
    coverpathplay = metadata.path + '/play.png';
    preferences_path = metadata.path + '/music-int-pref.py';
    compatible_players = metadata.players;
    support_seek = metadata.support_seek;
    
    this._schema = new Gio.Settings({ schema: 'org.gnome.shell.extensions.musicintegration' });
    default_setup = this._schema.get_string("setup");
    
    //Start listening for music players to integrate.
    for (var p=0; p<compatible_players.length; p++) {
		MusicPlayersList[p] = false;
        DBus.session.watch_name('org.mpris.MediaPlayer2.'+compatible_players[p], false,
            Lang.bind(this, addPlayer),
            Lang.bind(this, removePlayer)
        );
    }
    
    this._schema.connect('changed', Lang.bind(this, function(schema, key){
        if(key == "setup") default_setup = this._schema.get_string("setup");
        if (MusicEnabled) {
            disable(); enable();
		}
	}));
}

function enable() {
    MusicEnabled = true;
    _children = Main.panel._rightBox.get_children();
    for (var p=0; p<compatible_players.length; p++) {
		owner = 'org.mpris.MediaPlayer2.'+compatible_players[p];
        if(MusicPlayersList[p]) {
			if(default_setup == 1 || default_setup == 2) {
				MusicIndicators[p] = new MusicIndicator(owner, p);
		        Main.panel._rightBox.insert_actor(MusicIndicators[p].getActor(), _children.length - 1);
			    Main.panel._menus.addMenu(MusicIndicators[p].getMenu());
			}
			
            if(default_setup == 1 || default_setup == 3) {
                MusicSources[p] = new MusicSource(owner, p);
                Main.messageTray.add(MusicSources[p]);
                MusicNotifications[p] = new MusicNotification(MusicSources[p], owner, null, null, {
                    customContent : true
                });
                MusicSources[p].pushNotification(MusicNotifications[p]);
		    }
		}
    }
}

function disable() {
    MusicEnabled = false;
    for (var p=0; p<compatible_players.length; p++) {
		if (MusicIndicators[p]) MusicIndicators[p].destroy();
	    if (MusicSources[p]) MusicSources[p].destroy();
		if (MusicNotifications[p]) MusicNotifications[p].destroy();
    }
}

