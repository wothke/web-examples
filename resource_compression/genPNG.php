
<?php
	$inFileName=  $argv[1];

	$buffer = file_get_contents($inFileName);
	$length = filesize($inFileName);

	if (!$buffer || !$length) {
	  die("Reading error\n");
	}

	/* 3 bytes per pixel..*/
	$bypesPerPixel=3; // including alpha channel
	$pixelPadding = $bypesPerPixel - ($length % $bypesPerPixel);

	/* try to find 'good' image width */
	$w= 2;
	$l= round(sqrt(($length +$pixelPadding)/$bypesPerPixel));
	while($w < $l) {
		$w*= 2;
	}
	/* target image dimension in pixels */
	$w/= 2;
	$h= ceil(($length +$pixelPadding) / ($w*$bypesPerPixel));

	$totalPadding= ($w*$h*$bypesPerPixel)-$length;
	$padding= "";
	for ($i = 0; $i < $totalPadding; $i++) {
		$padding= $padding.' ';
	}
	$buffer= $buffer.$padding;
	$length+= $totalPadding;

	/* now create a fake PNG that contains the binary data*/

    $png = imagecreatetruecolor($w, $h);
    imagesavealpha($png, false);

    $bypesPerLine= $w*$bypesPerPixel;
	
	for ($x = 0; $x < $w; $x++) {
		for ($y = 0; $y < $h; $y++) {
			$idx= $x*$bypesPerPixel + $y*$bypesPerLine;
			$color= ( (ord($buffer[$idx]) <<16) | (ord($buffer[$idx+1]) <<8) | (ord($buffer[$idx+2])) ); // cannot use alpha since this crappy GD lib only supports 7-bit alpha..
//            $color = imagecolorallocatealpha($png, ord($buffer[$idx]), ord($buffer[$idx+1]), ord($buffer[$idx+2]), ord($buffer[$idx+3])); 

			imagesetpixel ( $png , $x , $y , $color );
		}
	}
    
    header("Content-type: image/png");
    imagepng($png, $inFileName.".png" );
?>