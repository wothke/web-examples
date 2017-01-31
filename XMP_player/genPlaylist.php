<?php 
/*
 This simple script recursively searches all subfolders for music files that 
 can be played with XMP and it outputs a respective playlist.

 A respective playlist can be used such as is demonstrated in the 
 usePlaylist.html example.
 
 Currently the output list is just a list of URLs - but the below code
 can be easily extended to print surrounding HTML, XML, JSON, etc
*/

// add any folders or files that should be excluded
$exclude_files =  array();

$file_dir = dirname(__FILE__);

function makeRelPath($str, $prefix) {
	$l=  strlen($prefix);
	if (substr($str, 0, $l) == $prefix) {
		$str = substr($str, $l);
	}
	return $str;
}

function filearray($start, $prefix) {
	global $exclude_files;
	$dir=opendir($start);
	while (false !== ($found=readdir($dir))) { 
		$getit[]=$found; 
	}
	foreach($getit as $num => $item) {
		if (is_dir($start.$item) && $item!="." && $item!=".." && array_search($item, $exclude_files)===false) { $output["{$item}"]=filearray($start.$item."/", $prefix); }
		if (is_file($start.$item) && array_search($item, $exclude_files)===false) { $output["{$item}"]=makeRelPath($start.$item, $prefix);  }
	}
	closedir($dir);
	ksort($output);
	return $output;
}

$ff = filearray($file_dir."/", $file_dir."/");

function printPlaylist($arr) {
	$i=0;
	foreach($arr as $key => $val) {		
		if(is_array($val)) {
			$folder_title=substr($key, $omit_folder_chars);
			ksort($val);
			printPlaylist($val);		
		} else {
			$file = $val;	
			/*
			* below the list of file extensions that are associated with XMP - if you want to create playlists for
			* other backends, just replace this list:
			*/
			if (preg_match("/^.*\.(it|xm|669|amd|amf|dbm|dmf|dtm|far|flx|fnk|gdm|gmc|hsc|imf|j2b|liq|m15|mdl|med|mod|mtm|okt|psm|ptm|rad|rtm|s3m|sfx|stm|stx|ult|umx|wow|emodkris|st26|st26|mod.nt)$/i", $file)) {
				$file_title= end(split(DIRECTORY_SEPARATOR,$file));

				$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
				$path= $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);

				$defaul_dir = substr($val,0,strrpos($val,'/'));
				$file_name_ = substr(strrchr($val, '/'), 1);
				$url_dec = rawurlencode($file_name_);
				$val = $defaul_dir .'/'.$url_dec;
				$file = $val;
				$file=$protocol.$path.'/'.$file;

				if ($file !== '') {
					if ($i>0 )print "
";
					print $file;
					$i=$i+1;					
				}		
			}
		}
	}
}
// currently the only output that is printed here is a plain list of URLs (see "print" statements above)
// just add whatever you want to print before/after the list - e.g. to directly create HTML..
printPlaylist ($ff);
?>
