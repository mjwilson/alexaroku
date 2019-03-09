var http = require('http');
var fs = require('fs');
var urllib = require("url");
var Client = require('node-ssdp').Client;
var dgram = require('dgram'); 
var YAML = require('yaml');

const configFile = fs.readFileSync('./roku.yaml', 'utf8');
const rokuConfig = YAML.parse(configFile);

var ssdp = new Client();

//handle the ssdp response when the roku is found
ssdp.on('response', function (headers, statusCode, rinfo) {
	rokuConfig.address = headers.LOCATION;
	console.log("Found Roku: ",rokuConfig.address);
});

//this is called periodically and will only look for the roku if we don't already have an address
function searchForRoku() {
	if (rokuConfig.address == null) {
		ssdp.search('roku:ecp');
	}
}

//a simple wrapper to post to a url with no payload (to send roku commands)
function post(url,callback) {
	var info = urllib.parse(url);
	console.log("Posting: ",url);
    var opt = {
        host:info.hostname,
		port:info.port,
        path: info.path,
        method: 'POST',
    };

    var req = http.request(opt, callback);

    req.end();
}

//Performing an operation on the roku normally takes a handful of button presses
//This function will perform the list of commands in order and if a numerical value is included in the sequence it will be inserted as a delay
function postSequence(sequence,callback) {
	function handler() {
		if (sequence.length == 0) {
			if (callback) callback();
			return;
		}
		var next = sequence.shift();
		if (typeof next === "number") {
			setTimeout(handler,next);
		} else if (typeof next === "string") {
			post(next,function(res) {
                res.on("data",function() {}); //required for the request to go through without error
                handler();
			});
		} else {
                    console.log ("unknown type "+typeof next);
		}
	}
	handler();
}

//In order to send keyboard input to the roku, we use the keyress/Lit_* endpoint which can be any alphanumeric character
//This function turns a string into a series of these commands with delays of 100ms built in
//NOTE: this currently ignores anything that isn't lowercase alpha
function createTypeSequence(text) {
	var sequence = [];
	for (i=0; i<text.length; i++) {
		var c = text.charCodeAt(i); 
		if (c == 32)
			sequence.push(rokuConfig.address+"keypress/Lit_%20");
		else
			sequence.push(rokuConfig.address+"keypress/Lit_"+text.charAt(i));
		sequence.push(100);	
	}
	return sequence;
}
//simple helper function to pull the data out of a post request. This could be avoided by using a more capable library such
function getRequestData(request,callback) {
	var body = "";
	request.on("data",function(data) {
		body += String(data);
	});
	request.on("end",function() {
		callback(body);
	});
}

//depending on the URL endpoint accessed, we use a different handler.
//This is almost certainly not the optimal way to build a TCP server, but for our simple example, it is more than sufficient
var handlers = {
    //This will play the last searched movie or show, we use it because it consistently resides to the right of the search box
	"/roku/playlast":function(request,response) { //NOT WORKING RIGHT NOW - NETFLIX CHANGED, NEEDS MODIFICATION TO APPLY TO ALL APPS
		postSequence([
			rokuConfig.address+"keypress/home",    //wake the roku up, if its not already
			rokuConfig.address+"keypress/home",    //go back to the home screen (even if we're in netflix, we need to reset the interface)
			3000,                           //loading the home screen takes a few seconds
			rokuConfig.address+"launch/12",        //launch the netflix channel (presumably this is always id 12..)
			7000,                           //loading netflix also takes some time
			rokuConfig.address+"keypress/down",    //the last searched item is always one click down and one click to the right of where the cursor starts
			rokuConfig.address+"keypress/right",
			1000,                           //more delays, experimentally tweaked.. can probably be significantly reduced by more tweaking
			rokuConfig.address+"keypress/Select",  //select the show from the main menu
			3000,                           //give the show splash screen time to load up
			rokuConfig.address+"keypress/Play"     //play the current/next episode (whichever one comes up by default)
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/downtwo":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/down",    //Down twice
			100,
			rokuConfig.address+"keypress/down",    
			100,                           
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/downthree":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/down",    //Down three times
			100,
			rokuConfig.address+"keypress/down",    
			100, 
			rokuConfig.address+"keypress/down",    
			100,			                        
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/downfour":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/down",    //Down four times
			100,
			rokuConfig.address+"keypress/down",   
			100,                           
			rokuConfig.address+"keypress/down",   
			100,
			rokuConfig.address+"keypress/down",    
			100,
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/downfive":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/down",    //Down five times
			100,
			rokuConfig.address+"keypress/down",    
			100,                          
			rokuConfig.address+"keypress/down",    
			100,
			rokuConfig.address+"keypress/down",    
			100,
			rokuConfig.address+"keypress/down",    //go back to the home screen (even if we're in netflix, we need to reset the interface)
			100,
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/uptwo":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/up",    //up twice
			100,
			rokuConfig.address+"keypress/up",    
			100,                         
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/upthree":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/up",    //up three times
			150,
			rokuConfig.address+"keypress/up",   
			150,      
			rokuConfig.address+"keypress/up",    
			150,                 
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/upfour":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/up",    //up four times
			150,
			rokuConfig.address+"keypress/up",   
			150,    
			rokuConfig.address+"keypress/up",   
			150,
			rokuConfig.address+"keypress/up",    
			150,                       //loading the home screen takes a few seconds
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/upfive":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/up",    //up five times
			150,
			rokuConfig.address+"keypress/up",    
			150,                  
			rokuConfig.address+"keypress/up",    
			150,
			rokuConfig.address+"keypress/up",   
			150,
			rokuConfig.address+"keypress/up",   
			150,        
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/righttwo":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/right",    //right two times
			150,
			rokuConfig.address+"keypress/right",    
			150,                          
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/rightthree":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/right",    //right three times
			150,
			rokuConfig.address+"keypress/right",    
			150,      
			rokuConfig.address+"keypress/right",  
			150,                    
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/rightfour":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/right",    //right four times
			150,
			rokuConfig.address+"keypress/right",    
			150,   
			rokuConfig.address+"keypress/right",   
			150,
			rokuConfig.address+"keypress/right",    
			150,                       
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/rightfive":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/right",    //right five times
			150,
			rokuConfig.address+"keypress/right",    
			150,
			rokuConfig.address+"keypress/right",    
			150,
			rokuConfig.address+"keypress/right",    
			150,
			rokuConfig.address+"keypress/right",   
			150,                 
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/lefttwo":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/left",    //left twice
			150,
			rokuConfig.address+"keypress/left",   
			150,                           
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/leftthree":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/left",    //left three times
			150,
			rokuConfig.address+"keypress/left",    
			150,
			rokuConfig.address+"keypress/left",   
			150,                           
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/leftfour":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/left",    //left four times
			150,
			rokuConfig.address+"keypress/left",    
			150,
			rokuConfig.address+"keypress/left",    
			150,
			rokuConfig.address+"keypress/left",   
			150,                          
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/leftfive":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/left",    //left five times
			150,
			rokuConfig.address+"keypress/left",    
			150,
			rokuConfig.address+"keypress/left",    
			150,
			rokuConfig.address+"keypress/left",    
			150,
			rokuConfig.address+"keypress/left",    
			150,                           
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/captionson":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/info",    //this function only works with a Roku TV, as a regular roku's caption's sequence is based on the individual app.
			150,
			rokuConfig.address+"keypress/down",    
			150,
			rokuConfig.address+"keypress/down",   
			150,
			rokuConfig.address+"keypress/down",    
			150,
			rokuConfig.address+"keypress/down",    
			150,                           
			rokuConfig.address+"keypress/down",    
			150,                           
			rokuConfig.address+"keypress/right",    
			150,
			rokuConfig.address+"keypress/info",    //presses info a second time to exit menu
			150,                           
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
	"/roku/captionsoff":function(request,response) {
		postSequence([
			rokuConfig.address+"keypress/info",    //this function only works with a Roku TV, as a regular roku's caption's sequence is based on the individual app.
			150,
			rokuConfig.address+"keypress/down",    
			150,
			rokuConfig.address+"keypress/down",   
			150,
			rokuConfig.address+"keypress/down",    
			150,
			rokuConfig.address+"keypress/down",    
			150,                          
			rokuConfig.address+"keypress/down",    
			150,                           
			rokuConfig.address+"keypress/left",    
			150,          
			rokuConfig.address+"keypress/info",    //presses info a second time to exit menu
			150,                 
		]);
		response.end("OK"); //we provide an OK response before the operation finishes so that our AWS Lambda service doesn't wait around through our delays
	},
    //This endpoint doenst perform any operations, but it allows an easy way for you to dictate typed text without having to use the on screen keyboard
	"/roku/type":function(request,response) {
		getRequestData(request,function(data) {
			var text = data.replace().toLowerCase(); 
			var sequence = createTypeSequence(text);
			postSequence(sequence,function() {

			});
			response.end("OK");	
		});
	},
	"/roku/search":function(request,response) {
		getRequestData(request,function(data) {
			var text = data.replace().toLowerCase();
			var sequence = createTypeSequence(text);
			postSequence(sequence);
			response.end("OK");	 //respond with OK before the operation finishes
		});
	},
    //Takes the POST data and uses it to search for a show and then immediate plays that show
	"/roku/searchroku":function(request,response) {
		getRequestData(request,function(data) {
			var text = data.replace().toLowerCase();      //Master search....if a movie, will auto go to channel (first choice is always the free channel you have installed - if no free channel, will take you but not hit play.
			var sequence = [].concat([			//If a TV show....will stop before selecting a channel (first choice is based on how many episodes avaialble, NOT based on cost - meaning manually choose - will also allow you to choose the specific season and episode manually using voice or remote)
				rokuConfig.address+"keypress/home",    //wake roku
				rokuConfig.address+"keypress/home",    //reset to home screen
				2200,
				rokuConfig.address+"keypress/down",
				150,
				rokuConfig.address+"keypress/down",
				150,
				rokuConfig.address+"keypress/down",
				150,
				rokuConfig.address+"keypress/down",
				150,
				rokuConfig.address+"keypress/down",
				150,
				rokuConfig.address+"keypress/select",
				800,
				],createTypeSequence(text),[
				rokuConfig.address+"keypress/right",
				150,
				rokuConfig.address+"keypress/right",
				150,
				rokuConfig.address+"keypress/right",
				150,
				rokuConfig.address+"keypress/right",
				150,
				rokuConfig.address+"keypress/right",
				150,
				rokuConfig.address+"keypress/right",
				500,
				rokuConfig.address+"keypress/select",
				1700,
				rokuConfig.address+"keypress/select",
				4000,
				]);
			postSequence(sequence);
			response.end("OK");	 //respond with OK before the operation finishes
		});
	},
	"/roku/searchplex":function(request,response) {
		getRequestData(request,function(data) {
			var text = data.replace().toLowerCase();      //Master search....if a movie, will auto go to channel (first choice is always the free channel you have installed - if no free channel, will take you but not hit play.
			var sequence = [].concat([			//If a TV show....will stop before selecting a channel (first choice is based on how many episodes avaialble, NOT based on cost - meaning manually choose - will also allow you to choose the specific season and episode manually using voice or remote)
				rokuConfig.address+"keypress/home",    //wake roku
				rokuConfig.address+"keypress/home",    //reset to home screen
				2000,			
				rokuConfig.address+"launch/13535",    //open plex
				7250,
				rokuConfig.address+"keypress/up",
				250,
				rokuConfig.address+"keypress/select",
				250,
				],createTypeSequence(text),[
				rokuConfig.address+"keypress/right",
				250,
				rokuConfig.address+"keypress/right",
				250,
				rokuConfig.address+"keypress/right",
				250,
				rokuConfig.address+"keypress/right",
				250,
				rokuConfig.address+"keypress/right",
				1500,
				rokuConfig.address+"keypress/right",
				1200,
				rokuConfig.address+"keypress/select",
				750,
				rokuConfig.address+"keypress/select",
				750,
				]);
			postSequence(sequence);
			response.end("OK");	 //respond with OK before the operation finishes
		});
	},
	"/roku/playlastyoutube":function(request,response) {    //not working yet - youtube search does not allow keyboard input. Next best thing is to play most recent.
		getRequestData(request,function(data) {
			var sequence = [].concat([
				rokuConfig.address+"keypress/home",    //wake roku
				500,
				rokuConfig.address+"launch/837",        //launch youtube app
				20000,
				rokuConfig.address+"keypress/up",    //navigate to search
				400,
				rokuConfig.address+"keypress/up",  //Navigate to search
				400,
				rokuConfig.address+"keypress/select",  //select search
				800,
				rokuConfig.address+"keypress/up",   //go to search selections (which show up to the right of they keyboard.. we need to tap through them)
				800,
				rokuConfig.address+"keypress/select",
				3200,
				rokuConfig.address+"keypress/select", 
				3200,                          //wait for main menu
				rokuConfig.address+"keypress/select", 
				3000,
			]);
			postSequence(sequence);
			response.end("OK");	 //respond with OK before the operation finishes
		});
	},
	"/roku/playpause":function(request,response) {		//the play and pause buttons are the same and is called "Play"
		post(rokuConfig.address+"keypress/Play");
		response.end("OK");	
	},
	"/roku/power":function(request,response) {		//Only for roku TV - can only turn TV OFF....not On, as once it is turned off, it will disable the network,
		post(rokuConfig.address+"keypress/Power");
		response.end("OK");	
	},
	"/roku/rewind":function(request,response) {		//rewind
		post(rokuConfig.address+"keypress/rev");
		response.end("OK");	
	},
	"/roku/fastforward":function(request,response) {	//fast forward
		post(rokuConfig.address+"keypress/fwd");
		response.end("OK");	
	},
	"/roku/up":function(request,response) {			//up
		post(rokuConfig.address+"keypress/up");
		response.end("OK");	
	},
	"/roku/down":function(request,response) {		//down
		post(rokuConfig.address+"keypress/down");
		response.end("OK");	
	},
	"/roku/back":function(request,response) {		//back
		post(rokuConfig.address+"keypress/back");
		response.end("OK");	
	},
	"/roku/left":function(request,response) {		//left
		post(rokuConfig.address+"keypress/left");
		response.end("OK");	
	},
	"/roku/instantreplay":function(request,response) {	//instant replay, go back 10 secounds
		post(rokuConfig.address+"keypress/instantreplay");
		response.end("OK");	
	},
	"/roku/right":function(request,response) {		//right
		post(rokuConfig.address+"keypress/right");
		response.end("OK");	
	},
	"/roku/select":function(request,response) {		//select - this is often more useful than play/pause - same as OK on the remote
		post(rokuConfig.address+"keypress/select");
		response.end("OK");	
	},
	"/roku/nextepisode":function(request,response) {	//NOT being utilized right now, needs tweaking
		postSequence([
			rokuConfig.address+"keypress/back",
			1000,
			rokuConfig.address+"keypress/down",
			100,
			rokuConfig.address+"keypress/down",
			100,
			rokuConfig.address+"keypress/select",
			2000,
			rokuConfig.address+"keypress/right",
			100,
			rokuConfig.address+"keypress/select",
			1000,
			rokuConfig.address+"keypress/Play",
		],function() {

		});
		response.end("OK");
	},
	"/roku/lastepisode":function(request,response) {	//NOT being utilized right now, needs tweaking
		postSequence([
			rokuConfig.address+"keypress/back",
			1000,
			rokuConfig.address+"keypress/down",
			100,
			rokuConfig.address+"keypress/down",
			100,
			rokuConfig.address+"keypress/select",
			2000,
			rokuConfig.address+"keypress/left",
			100,
			rokuConfig.address+"keypress/select",
			1000,
			rokuConfig.address+"keypress/Play",
		],function() {

		});
		response.end("OK");
	},
        "/roku/amazon":function(request,response) {			//function to open Amazon, ID below
        	postSequence([
			amazon(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/plex":function(request,response) {			//function to open Plex, ID below
        	postSequence([
			plex(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/pandora":function(request,response) {			//function to open Pandora, ID below
        	postSequence([
			pandora(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/hulu":function(request,response) {			//function to open Hulu, ID below
        	postSequence([
			hulu(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/NowTV":function(request,response) {			//function to open Now TV, ID below
        	postSequence([
			nowTV(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/home":function(request,response) {			//function for Home button, ID below
        	postSequence([
			home(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
		"/roku/tv":function(request,response) {			//function for TV input - ROKU TV ONLY
        	postSequence([
			tv(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
		"/roku/fourk":function(request,response) {		//Function for 4K Spotlight Channel - possibly 4k Roku version only
        	postSequence([
			fourk(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
		"/roku/hbo":function(request,response) {		//function for HBOGO, ID below
        	postSequence([
			hbo(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },		
        "/roku/youtube":function(request,response) {			//function for YouTube, ID below
        	postSequence([
			youtube(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },		
        "/roku/netflix":function(request,response) {			//function for Netflix, ID below
        	postSequence([
			netflix(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/shudder":function(request,response) {			//function for Shudder, ID below
        	postSequence([
			shudder(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
        "/roku/iplayer":function(request,response) {			//function for iPlayer, ID below
        	postSequence([
			iplayer(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        },
		"/roku/fx":function(request,response) {			//function for FX Channel, ID below
        	postSequence([
			fx(rokuConfig.address),
		],function(){

		});
		response.end("OK");
        }
}

//handles and incoming request by calling the appropriate handler based on the URL
function handleRequest(request, response){
	if (handlers[request.url]) {
		handlers[request.url](request,response);
	} else {
		console.log("Unknown request URL: ",request.url);
		response.end();
	}
}


// Launches the Amazon Video channel (id 13)
function amazon(address){
 return address+"launch/13";
}
// Launches the Pandora channel (id 28)
function pandora(address){
 return address+"launch/28";
}

// Launches the Hulu channel (id 2285)
function hulu(address){
 return address+"launch/2285";
}

// Launches the Now TV channel (id 2285)
function nowTV(address){
 return address+"launch/20242";
}

// Launches the Plex channel (id 13535)
function plex(address){
 return address+"launch/13535";
}

// Sends the Home button
function home(address){
  return address+"keypress/home";
}

// Launches the TV channel (id tvinput.dtv)
function tv(address){
 return address+"launch/tvinput.dtv";
}

// Launches the fourK channel (id 69091)
function fourk(address){
 return address+"launch/69091";
}

// Launches the HBO channel (id 8378)
function hbo(address){
 return address+"launch/8378";
}

// Launches the FX channel (id 47389)
function fx(address){
 return address+"launch/47389";
}

// Launches the YouTube channel (id 837)
function youtube(address){
 return address+"launch/837";
}

// Launches the Netflix channel (id 12)
function netflix(address){
 return address+"launch/12";
}

// Launches the Shudder channel (id 59997)
function shudder(address){
 return address+"launch/59997";
}

// Launches the iPlayer channel (id 11703)
function iplayer(address){
 return address+"launch/11703";
}

//start the MSEARCH background task to try every second (run it immediately too)
setInterval(searchForRoku,1000);
searchForRoku();

//start the tcp server
http.createServer(handleRequest).listen(rokuConfig.port,function(){
    console.log("Server listening on: http://localhost:%s", rokuConfig.port);
});
