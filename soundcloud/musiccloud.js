/**
* musiccloud.js: Soundcloud music playback and waveform visualization.
*
* Copyright (C) 2014 Juergen Wothke
*
* Terms of Use: This software is licensed under a CC BY-NC-SA 
* (http://creativecommons.org/licenses/by-nc-sa/4.0/).
*
* This file is the result of various attempts to load and play mp3 files in Chrome & Firefox.
*
* - Directly loading the data and decoding it with the AudioContext unfortunately does not work well:
*   Playback can only be started AFTER all the data has been loaded AND decoded.. especially
*   decoding proves to be VERY slow (e.g. 15sec for a 2min mp3 track). Worse still, the respective 
*   mp3 decoding API does not work in Firefox <=32.0 at all (at least on Windows). 
*   In the current implementation the music playback is therefore delegated to the standard <audio> 
*   element. This works even in Firefox and allows to start playback before all data has been 
*   loaded/decoded. (It is a drawback of this implementation that we are now getting no useful
*   "load progress" events.)
*
* This file depends on a proxy.php script which handles the actual requests to the Soundcloud servers.
*/

window.AudioContext = window.AudioContext||window.webkitAudioContext;
if (!window['AudioContext']) {
	alert('You need a recent browser with HTML5 WebAudio support.');
}
audioCtx= new AudioContext();	// global var

window.requestAnimFrame = (function() {
	return window.requestAnimationFrame ||
		 window.webkitRequestAnimationFrame ||
		 window.mozRequestAnimationFrame ||
		 window.oRequestAnimationFrame ||
		 window.msRequestAnimationFrame ||
		 function( callback,  element) {
		   window.setTimeout(callback, 1000/60);
		 };
})();	

// determine the folder that this script is located in
var scripts= document.getElementsByTagName('script');
var path= scripts[scripts.length-1].src.split('?')[0];      // remove any ?query
var mydir= path.split('/').slice(0, -1).join('/')+'/';  // remove last filename part of path

// curently uses a proxy script located within the same directory (to avoid cross origin calls to soundcloud.com)
var scURLprefix = mydir+ "proxy.php?";

/*
* Widget displaying the Soundcloud supplied "waveform image" with the playback progress and song title. 
*/
WaveformDisplay = function(canvasId) {
	this.canvasId= canvasId;
	this.waveImg= 0;
};

WaveformDisplay.prototype = {
	updateImage: function(src) {
		this.waveImg= 0;
		var imgObj = new Image();

		imgObj.onload = function () { 
			this.waveImg= imgObj;
		}.bind(this);
		imgObj.src=src;
	},
	drawWaveform: function(loadprogress, progress){
		progress= Math.min(isNaN(progress) ? 0 : progress, 1);
		loadprogress= Math.min(isNaN(loadprogress) ? 0 : loadprogress, 1);
		
		if (loadprogress < 1) progress= 0;	// we don't care about the playback progress while still loading
		
		var w= 500;
		var h= 50;		
		var x1= w*progress;
		var y1= h*0.7;
		
		var c= $(this.canvasId)[0];	// jQuery crap.. canvas is wrapped..
		var ctx = c.getContext('2d');


		ctx.save();
		
		var darkgrey1 = '#333333';
		var darkgrey2 = '#232323';
		var lightgrey1 = '#999999';
		var lightgrey2 = '#b9b9b9';
		
		var darkorange1 = '#ff5200';
		var darkorange2 = '#ff3400';
		var lightorange1 = '#ffd5c0';
		var lightorange2 = '#ffaa80';
		
		ctx.globalAlpha=0.5;	// increase transparency of existing background
		
		// draw 4 quadrant background using Linear Gradients
		if (loadprogress == 1) {
			// highlight played part
			var g1 = ctx.createLinearGradient(0,0,0,h);
			g1.addColorStop(0, darkorange1);
			g1.addColorStop(y1/h, darkorange2);
			g1.addColorStop(y1/h, lightorange1);
			g1.addColorStop(1, lightorange2);	
			ctx.fillStyle = g1;
			ctx.fillRect(0,0,x1,h);
		}
		var g2 = ctx.createLinearGradient(0,0,0,h);
		g2.addColorStop(0, darkgrey1);
		g2.addColorStop(y1/h, darkgrey2);
		g2.addColorStop(y1/h, lightgrey1);
		g2.addColorStop(1, lightgrey2);	
		ctx.fillStyle = g2;
		
		if (loadprogress == 1) {
			// regular mode
			ctx.fillRect(x1,0,w-x1,h);
		} else {
			// still loading.. show loaded portion
			ctx.fillRect(0,0,w*loadprogress,h);
		}
		// draw vertical stripes
		ctx.globalAlpha=0.2;	// increase transparency of existing background

		var i;
		var s= 3;
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255,255,255,0.3)';
		for (i= 0; i<w/s; i++) {
			ctx.beginPath();
			ctx.moveTo(i*s, 0);
			ctx.lineTo(i*s, h);
			ctx.stroke();
		}

		// mask out shape of the wavedata
		ctx.globalCompositeOperation = 'destination-out';
		
		ctx.globalAlpha=0.6;	// increase transparency of existing background

		if (this.waveImg) {
			var imgWidth= this.waveImg.width;
			var imgHeight= this.waveImg.height;

			ctx.drawImage(this.waveImg, 0,0, imgWidth*loadprogress, imgHeight, 0, 0, w*loadprogress, h);
		}
		
		// restore defaults
		ctx.restore();
		ctx.restore();
	}	
};

/*
* Optional beatDetector can be injected into the audio node 
* chain, e.g. as a base for beat detection, etc
*/
Analyzers = function(beatDetector) {
	this.beatDetector= beatDetector;	// optional
	
	var f = audioCtx.createBiquadFilter()
	
	/*
		try to get some filter constants that hopefully work.. strings.. ints.. bloody API mess..
		see http://chimera.labs.oreilly.com/books/1234000001552/ch06.html#s06_2
		LOWPASS, Makes sounds more muffled
		HIGHPASS, Makes sounds more tinny
		BANDPASS, Cuts off lows and highs (e.g., telephone filter)
		LOWSHELF, Affects the amount of bass in a sound (like the bass knob on a stereo)
		HIGHSHELF, Affects the amount of treble in a sound (like the treble knob on a stereo)
		PEAKING, Affects the amount of midrange in a sound (like the mid knob on a stereo)
		NOTCH, Removes unwanted sounds in a narrow frequency range
		ALLPASS, ...
	*/	
	this.LOWPASS= ("LOWPASS" in f) ? f.LOWPASS : 'lowpass';
	this.HIGHPASS= ("HIGHPASS" in f) ? f.HIGHPASS : 'highpass';
	this.BANDPASS= ("BANDPASS" in f) ? f.BANDPASS : 'bandpass';
	this.LOWSHELF= ("LOWSHELF" in f) ? f.LOWSHELF : 'lowshelf';
	this.PEAKING= ("PEAKING" in f) ? f.PEAKING : 'peaking';
	this.HIGHSHELF= ("HIGHSHELF" in f) ? f.HIGHSHELF : 'highshelf';
	this.NOTCH= ("NOTCH" in f) ? f.NOTCH : 'notch';
	this.ALLPASS= ("ALLPASS" in f) ? f.ALLPASS : 'allpass';
	
	this.NO_FILTER= -1;
	
	this.analyzerCfg;
	this.once= false;		
};

Analyzers.prototype = {
	/**
	* returns the respective Analyzer - if available
	*/
	getAnalyzer: function(i) {
		if (this.analyzerCfg) {
			if (this.analyzerCfg.length > i) {
				return this.analyzerCfg[i][5];	// see comment above
			}
		}
		return null;
	},
	getHiHatAnalyzer: 	function() { return this.getAnalyzer(0)},
	getBandAnalyzer: 	function() { return this.getAnalyzer(1)},
	getVolAnalyzer: 	function() { return this.getAnalyzer(2)},

	setupBeatAnalyzer: function(analyzer, source) {
		if (this.beatDetector != null) {
			var beatAnalyzer = this.beatDetector.getBeatAnalyzerNode(source, analyzer);
			beatAnalyzer.connect(audioCtx.destination);
			source.connect(beatAnalyzer);			
		} else {
			source.connect(audioCtx.destination);			
		}
	},
	getBeats: function() {
		if (this.beatDetector == null) return null;
		
		return this.beatDetector.getBeats();
	},	
	setupWebAudioNodes: function(player) {
		if (!this.once && this.analyzerCfg) {
			this.once = true;
			
			var source = audioCtx.createMediaElementSource(player);
			source.connect(audioCtx.destination);	// play unchanged
						
			var analyzer = audioCtx.createAnalyser();
			analyzer.fftSize= 1024;
			this.setupBeatAnalyzer(analyzer, source);	// setup optional beat analyzer
				
			// add optional analyizer/filter nodes
			var i;
			for(i= 0;i<this.analyzerCfg.length; i++) {
				var p= this.analyzerCfg[i];
			
				analyzer = audioCtx.createAnalyser();
				p[5]= analyzer;
				analyzer.fftSize= p[0];
				
				if (p[1] == this.NO_FILTER) {
					source.connect(analyzer);
				} else {
					// see https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
					var filterNode= audioCtx.createBiquadFilter();	
						
					filterNode.type= p[1];
					filterNode.frequency.value= p[2];
					filterNode.Q.value= p[3];
					filterNode.gain.value= p[4];
					
					source.connect(filterNode);
					filterNode.connect(analyzer);
				}
			}		
		}
	},
	setConfig: function(cfg) {
		if (cfg)
			this.analyzerCfg= cfg;
	}	
};

/*
* Controls the music playback and playlist handling.
*/
CloudPlayer = function(guiIdMap, analyzers, waveformDisplay, beatDetector) {
	this.guiIdMap= guiIdMap; 

	if (this.guiIdMap == null) {
		this.guiIdMap= {	// defaults for GUI mapping
			player:		"#player",
			source:		"#mp3Source",
			loading: 	"#isloading",
			title:		"#sound-title"
		};		
	}
	
	this.analyzers= analyzers;
	this.waveformDisplay= waveformDisplay;
	this.beatDetector= beatDetector;
	this.currentSong;
	this.playlist;

	this.player= null;
	this.running = false;
};

CloudPlayer.prototype =  {
	setupPlaylist: function(soundUrl, jsonData) {
		if (soundUrl.indexOf("/sets/") == -1) {
			/*
			 sound = JSON meta-data with all the attributes returned by the "Soundcloud service":
						- id, title, user.username, waveform_url
			*/
			jsonData=  { tracks: [jsonData]};
		}
		this.playlist= jsonData;
	},
	setNextSong: function() {
		this.currentSong= ((this.currentSong !== undefined) ? this.currentSong+1 : 0) % this.playlist.tracks.length;
		var song= this.playlist.tracks[this.currentSong];
		var permLink= song.permalink_url.replace("http:\/\/soundcloud.com", "");
		

		$(this.guiIdMap.title).html('<a target="_blank" href="http://www.soundcloud.com'+permLink+'">'+song.title +'</a>');

		if (this.waveformDisplay != null) {
			this.waveformDisplay.updateImage(song.waveform_url);
			this.waveformDisplay.drawWaveform(1, 0);		// we cannot get useful "load progress" info with this impl
		}

		return scURLprefix+permLink;	
	},
	initMusic: function() {
			// last param is placeholder for the caching of the AnalyzerNode
		var cfg= [	
					[32, this.analyzers.HIGHPASS, 19000, 0, -40, null],	// hihat
					[32, this.analyzers.BANDPASS, 9900, 100, 0, null],	// band
					[32, this.analyzers.LOWPASS, 5000, 0, -40, null]		// vol
				];
		this.startMusic(cfg);
	},
	startMusic: function(cfg) {
		this.currentSong= undefined;
		
		this.analyzers.setConfig(cfg);

		// currently the song to be played is selected from the URL by adding its 
		// soundcloud ID after a hash tag, e.g. "#/foo/bar"
		// you might want to change this part of the implementation..
		var soundUrl = document.location.hash.substring(1);	
		if (!soundUrl.length) return null;

		var mp3Player= $(this.guiIdMap.player)[0];
		
		// what a shitty implementation in Chrome31: NOT EVEN setting "loop" prevents the
		// player from ditching the mp3 file and it actually DOES NOT loop.. it plays the file once 
		// but then seems to end up in some unusable state (there is no "ended" event but it does not play 
		// either)	
		//mp3Player.loop= true;

		mp3Player.autoplay= true;	// needed for Firefox! (normal eventhandling does not work correctly in FF)
		
		$(this.guiIdMap.loading).empty().append('<div class="loading"><img src="./images/loading.gif"></div>');
	
		var u= scURLprefix+ soundUrl + '.json';
		$.getJSON(u, function(jsonData) {		
			this.setupPlaylist(soundUrl, jsonData);
					
			// let standard <audio> element play the song		
//			$("#mp3Source").attr("src", this.setNextSong() + '/audio').detach().appendTo("#player");
			mp3Player.setAttribute('src',this.setNextSong() + '/audio');

			mp3Player.addEventListener("stalled", function() {
				$(this.guiIdMap.loading).empty().append(' ');	// remove "loading" image
				mp3Player.play();						
			}.bind(this));
			
			mp3Player.addEventListener("emptied", function() {}.bind(this));
			
			mp3Player.addEventListener("suspend", function() {}.bind(this));
			
			mp3Player.addEventListener("canplay", function() {
				$(this.guiIdMap.loading).empty().append(' ');	// remove "loading" image

				this.analyzers.setupWebAudioNodes(mp3Player);	
				
				this.startProgress(mp3Player);							
				mp3Player.play();						
			}.bind(this));

			mp3Player.addEventListener("ended", function() {
						// sidenote: unfortunately it only seems to work for short songs to restart using:
						//					this.currentTime= 0;
						//					this.play();
						// probably the silly AudioElement may already have discarded
						// the data and the only save approach seems to reload the file..
						// other than buffering the whole file manually (i.e. not using the player)
						// the below seems to be the only way that works reliably..
						// (bloody stupid though, having to load the same file again and 
						// again..)
						// while using a playlist this does of course not make any difference..
						
						$(this.guiIdMap.source).attr("src", this.setNextSong() + '/audio').detach().appendTo(this.guiIdMap.player);
						mp3Player.load();
					}.bind(this));

			mp3Player.load();	// will trigger events that initiate further processing (above)
		}.bind(this)).fail(function(){
			alert("Sorry but there is no music with perma link: "+ soundUrl);
						
			$(this.guiIdMap.loading).empty().append('');	// remove "loading" image	
	  });
	},
	// ------------- handling of playback "progress bar" ------------------------
	startProgress: function(player) {
		this.mp3Player= player;
		this.running = true;
		this.updateProgress();
	},
	stopProgress: function() {
		this.running = false;
	},
	getCurrentPlayTime: function() {
		return this.mp3Player.currentTime? this.mp3Player.currentTime*1000 : 0;
	},
	updateProgress: function() {
		if (!this.running) {
			return;
		}
		var currentTime= this.getCurrentPlayTime();
		var currentDuration = this.mp3Player.duration*1000;
		var progress= currentTime / currentDuration;
		
		if ((this.waveformDisplay != null) && (currentTime < currentDuration)) {
			this.waveformDisplay.drawWaveform(1, progress);
		}
		requestAnimFrame(function() { this.updateProgress(); }.bind(this));
	},	
}