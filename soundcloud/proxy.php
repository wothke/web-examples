<?php
/*
 * This proxy script allows to forward calls to SoundCloud APIs which cannot be  
 * invoked directly due to cross domain access restrictions.
 *
 * It is specifically designed to work with AudioJedit. The proxy script may be
 * used as a substitute for the node.js based router that comes with that project.
 */
 
$client_id= '[your Soundcloud client ID must be configured here!]';
 

// get the "[PATH]/proxy.php?" prefix
$url_pre= $_SERVER['REQUEST_URI'];
list($url_pre, $ignore) = explode('?', $url_pre);
$url_pre= $url_pre.'?';

$agent = 'proxy client';

$header_done= false;
function stream_write($ch, $data) {				// --- util for direct streaming of binary data
	// note: the header data is delivered one line at a time..

	if (!$GLOBALS[header_done]) {
	
		$line = $data;
		if(strlen($line)<5){				// too short for header
				$GLOBALS[header_done]= true;
				// try to get at least some data to the browser
				// (recent Chrome browsers: without flush TTFB aborts after ~10secs.. and
				// "content download" time is ~0sec; with flush TTFB is 1.6sec and "content download"
				// time is 8.4sec -- in both cases Chrome seems to quit after 10secs..)
		//		flush();					
		} else {
			// output header line
			
			if(preg_match("/^Keep-Alive/",$line)){
			} else if(!preg_match("/^Content-Type/",$line)){
				$line = str_replace($base,$mydomain,$line); //header rewrite if needed
				header(trim($line));
			} else {
				// FIXME make more robust
				$line = str_replace('audio/mpeg','application/octet-stream',$line);
				header(trim($line));
			}		
		}
	} else {
		print $data;	// directly send what we've got..
	//	flush();					
	}
	return strlen($data);	
}

function endsWith($haystack, $needle)
{
    return $needle === "" || substr($haystack, -strlen($needle)) === $needle;
}

function curl_exec_follow(/*resource*/ $ch, $stream_mode, /*int*/ &$maxredirect = null) {
    $mr = $maxredirect === null ? 5 : intval($maxredirect);
    if (ini_get('open_basedir') == '' && ini_get('safe_mode' == 'Off')) {
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, $mr > 0);
        curl_setopt($ch, CURLOPT_MAXREDIRS, $mr);
    } else {
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
        if ($mr > 0) {
            $newurl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);

            $rch = curl_copy_handle($ch);
            curl_setopt($rch, CURLOPT_HEADER, true);
            curl_setopt($rch, CURLOPT_NOBODY, true);
            curl_setopt($rch, CURLOPT_FORBID_REUSE, false);
            curl_setopt($rch, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($rch, CURLOPT_USERAGENT, $agent);

            do {
                curl_setopt($rch, CURLOPT_URL, $newurl);
                $header = curl_exec($rch);
				
                if (curl_errno($rch)) {
                    $code = 0;
                } else {
                    $code = curl_getinfo($rch, CURLINFO_HTTP_CODE);
                    if ($code == 301 || $code == 302) {
					
                        preg_match('/Location:(.*?)\n/', $header, $matches);
                        $newurl = trim(array_pop($matches));
						
						$newurl= htmlspecialchars_decode ( $newurl );	// but maybe this is better?
//						$newurl= utf8_decode ( $newurl );				// this seemed to work..
                  } else {
                        $code = 0;
                    }
                }
            } while ($code && --$mr);
            curl_close($rch);
            if (!$mr) {
                if ($maxredirect === null) {
                    trigger_error('Too many redirects. When following redirects, libcurl hit the maximum amount.', E_USER_WARNING);
                } else {
                    $maxredirect = 0;
                }
                return false;
            }
            curl_setopt($ch, CURLOPT_URL, $newurl);

			if ($stream_mode) {			
				curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);	// direkt output
				curl_setopt($ch, CURLOPT_BINARYTRANSFER, true);
				curl_setopt($ch, CURLOPT_HEADER, true);	// include header in output			
				curl_setopt($ch, CURLOPT_WRITEFUNCTION, 'stream_write');	
			}
        }
    }
	
    return curl_exec($ch);
} 


function sendRequest($reqUrl, $stream_mode=false){
	// Open the cURL session
	$curlSession = curl_init();
	
	curl_setopt ($curlSession, CURLOPT_URL, $reqUrl);
	curl_setopt ($curlSession, CURLOPT_HEADER, 1);

	if($_SERVER['REQUEST_METHOD'] == 'POST'){
		curl_setopt ($curlSession, CURLOPT_POST, 1);
		curl_setopt ($curlSession, CURLOPT_POSTFIELDS, $_POST);
	}
	curl_setopt($curlSession, CURLOPT_RETURNTRANSFER,1);
	curl_setopt($curlSession, CURLOPT_TIMEOUT,60);
	curl_setopt($curlSession, CURLOPT_SSL_VERIFYHOST, 0);
	curl_setopt($curlSession, CURLOPT_SSL_VERIFYPEER, false);	// shut up annoying SSL errors on HTTP(!) requests
//	curl_setopt ($curlSession, CURLOPT_COOKIEJAR, $ckfile); 
//	curl_setopt ($curlSession, CURLOPT_COOKIEFILE, $ckfile);
	curl_setopt($curlSession, CURLOPT_USERAGENT, $agent);

	//Send the request and store the result in an array
	$resp = curl_exec_follow ($curlSession, $stream_mode);

	// Check that a connection was made
	if ($resp === false){
		$err= curl_error($curlSession);
			// If it wasn't...
			error_log($err);
			$resp= NULL;
	}
	curl_close ($curlSession);

	return $resp;
}

function handleResponse($res) {
	//clean duplicate header that seems to appear on fastcgi with output buffer on some servers!!
	$res = str_replace("HTTP/1.1 100 Continue\r\n\r\n","", $res);

	$ar = explode("\r\n\r\n", $res, 2); 

	$header = $ar[0];
	$body = $ar[1];
	
	//handle headers - simply re-outputing them
	$header_ar = split(chr(10),$header); 
	foreach($header_ar as $k=>$v){
		if(!preg_match("/^Cache-Control/",$v)){
			header('Cache-Control: private');	// supress caching.. 
		} else if(!preg_match("/^Transfer-Encoding/",$v)){
			$v = str_replace($base,$mydomain,$v); //header rewrite if needed
			header(trim($v));
		}
	}
	//rewrite all hard coded urls to ensure the links still work!
	$body = str_replace($base,$mydomain,$body);

//	error_log('body: ['.$body.']');

	print $body;
}

session_start();
ob_start();

$req_uri= $_SERVER['REQUEST_URI'];

/* config settings */
$ckfile = '/tmp/simpleproxy-cookie-'.session_id();  //this can be set to anywhere you fancy!  just make sure it is secure.

if($_SERVER['HTTPS'] == 'on'){
	$mydomain = 'https://'.$_SERVER['HTTP_HOST'];
} else {
	$mydomain = 'http://'.$_SERVER['HTTP_HOST'];
}

// need to go through this proxy as a workaround for cross-domain calls
$url = str_replace($url_pre, '', $req_uri);
	
if (endsWith($url, '.json')) {
	// resolve meta data
	$matches = preg_split("/[\/|\.]/", $url); 
	
	if (strpos($url,'/sets/') !== false) {
		$url= 'http://api.soundcloud.com/resolve.json?client_id=' .$client_id.'&url=http://soundcloud.com/'.$matches[1].'/sets/'.$matches[3];
	} else {
		$url= 'http://api.soundcloud.com/resolve.json?client_id=' .$client_id.'&url=http://soundcloud.com/'.$matches[1].'/'.$matches[2];
	}	
	
	// straight forward case..
	$response= sendRequest($url);
	
	if (!is_null($response)) {
		handleResponse($response);
	} else {
//		error_log('NO RESPONSE1');
	}

} else if (endsWith($url, '/audio')) {
	// get the "track" infos (seems they switched to fully qualified URLs)
	//preg_match('/^\/([\w-_]+)\/([\w-_]+)\/audio/', $url, $matches);	
	preg_match('/^https:\/\/soundcloud.com\/([\w-_]+)\/([\w-_]+)\/audio/', $url, $matches);	
	$url= 'http://api.soundcloud.com/resolve.json?client_id=' .$client_id.'&url=http://soundcloud.com/'.$matches[1].'/'.$matches[2];		

	$response= sendRequest($url);
	if (!is_null($response)) {
		// extract the "stream_url" (without properly decoding the JSON body)	
		preg_match('/"stream_url":"([:\/\.\w]+)"/', $response, $matches);	
		$stream_url= $matches[1]; 				// e.g. "https://api.soundcloud.com/tracks/11111111/stream"

		$stream_url= $stream_url.'?client_id=' .$client_id;

//		error_log($stream_url);	// the actual URL of the mp3 file
		
		// note: the $stream_url will be redirected to something like
		// https://ec-media.soundcloud.com/Kaq9koVEZo93.128.mp3?f10880d390....
		$response= sendRequest($stream_url, true);
		if (!is_null($response)) {
			// nothing left to be done for streamed file...
		} else {
		}
	} else {
	}
} else {
//	error_log('NOT IMPLEMENTED');
}

?>