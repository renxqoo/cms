CREATE FUNCTION cms_wgs84_distance(lon1 double precision,lat1 double precision,lon2 double precision,lat2 double precision)
RETURNS double precision
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
AS $$
DECLARE
  flattening CONSTANT double precision := 1.0/298.257223563;
  axis CONSTANT double precision := 6378137.0;
  minor_axis CONSTANT double precision := axis*(1.0-flattening);
  eccentricity CONSTANT double precision := flattening*(2.0-flattening);
  second_eccentricity CONSTANT double precision := eccentricity/power(1.0-flattening,2);
  nodes CONSTANT double precision[] := ARRAY[0.09501250983763744,0.2816035507792589,0.4580167776572274,0.6178762444026438,0.755404408355003,0.8656312023878318,0.9445750230732326,0.9894009349916499];
  weights CONSTANT double precision[] := ARRAY[0.1894506104550685,0.1826034150449236,0.16915651939500254,0.14959598881657673,0.12462897125553388,0.09515851168249278,0.06225352393864789,0.027152459411754095];
  longitude double precision;
  latitude1 double precision := lat1;
  latitude2 double precision := lat2;
  temporary double precision;
  beta1 double precision;
  beta2 double precision;
  sine1 double precision;
  cosine1 double precision;
  sine2 double precision;
  cosine2 double precision;
  lower_angle double precision := -pi()/2;
  upper_angle double precision := pi()/2;
  azimuth double precision;
  sine_azimuth double precision;
  cosine_azimuth double precision;
  equatorial_sine double precision;
  equatorial_cosine double precision;
  sigma1 double precision;
  sigma2 double precision;
  sigma12 double precision;
  omega12 double precision;
  endpoint_cosine double precision;
  latitude_difference double precision;
  midpoint double precision;
  half_arc double precision;
  coefficient double precision;
  integral_distance double precision;
  integral_longitude double precision;
  factor1 double precision;
  factor2 double precision;
  lambda12 double precision;
  iteration integer;
  quadrature integer;
BEGIN
  IF abs(lon1)>180 OR abs(lon2)>180 OR abs(lat1)>90 OR abs(lat2)>90 THEN
    RAISE EXCEPTION 'Invalid WGS84 coordinates' USING ERRCODE='22023';
  END IF;
  longitude := abs(radians(lon2-lon1));
  IF longitude>pi() THEN longitude := 2*pi()-longitude; END IF;
  IF latitude1=latitude2 AND (longitude=0 OR abs(latitude1)=90) THEN RETURN 0; END IF;
  IF abs(latitude1)<abs(latitude2) THEN temporary := latitude1; latitude1 := latitude2; latitude2 := temporary; END IF;
  IF latitude1>0 THEN latitude1 := -latitude1; latitude2 := -latitude2; END IF;
  IF abs(radians(latitude1))+abs(radians(latitude2))<=(1-flattening)*power(2.0,-52) THEN latitude1 := 0; latitude2 := 0; END IF;
  IF latitude1=0 AND latitude2=0 AND longitude<pi()*(1-flattening) THEN RETURN axis*longitude; END IF;
  beta1 := atan((1-flattening)*tan(radians(latitude1)));
  beta2 := atan((1-flattening)*tan(radians(latitude2)));
  sine1 := sin(beta1); cosine1 := cos(beta1);
  sine2 := sin(beta2); cosine2 := cos(beta2);
  IF -sine1<cosine1 THEN latitude_difference := (sine1-sine2)*(sine1+sine2);
  ELSE latitude_difference := (cosine2-cosine1)*(cosine2+cosine1); END IF;
  FOR iteration IN 1..128 LOOP
    azimuth := (lower_angle+upper_angle)/2;
    sine_azimuth := cos(azimuth); cosine_azimuth := -sin(azimuth);
    equatorial_sine := sine_azimuth*cosine1;
    equatorial_cosine := sqrt(power(cosine_azimuth,2)+power(sine_azimuth*sine1,2));
    sigma1 := atan2(sine1,cosine_azimuth*cosine1);
    endpoint_cosine := sqrt(greatest(0.0,power(cosine_azimuth*cosine1,2)+latitude_difference));
    sigma2 := atan2(sine2,endpoint_cosine);
    sigma12 := atan2(greatest(0.0,cos(sigma1)*sin(sigma2)-sin(sigma1)*cos(sigma2)),cos(sigma1)*cos(sigma2)+sin(sigma1)*sin(sigma2));
    omega12 := atan2(greatest(0.0,cosine_azimuth*cosine1*equatorial_sine*sine2-equatorial_sine*sine1*endpoint_cosine),cosine_azimuth*cosine1*endpoint_cosine+power(equatorial_sine,2)*sine1*sine2);
    half_arc := sigma12/2; midpoint := sigma1+half_arc;
    coefficient := second_eccentricity*power(equatorial_cosine,2);
    integral_distance := 0; integral_longitude := 0;
    FOR quadrature IN 1..8 LOOP
      factor1 := sqrt(1+coefficient*power(sin(midpoint-half_arc*nodes[quadrature]),2));
      factor2 := sqrt(1+coefficient*power(sin(midpoint+half_arc*nodes[quadrature]),2));
      integral_distance := integral_distance+weights[quadrature]*(factor1+factor2);
      integral_longitude := integral_longitude+weights[quadrature]*(1/(1+(1-flattening)*factor1)+1/(1+(1-flattening)*factor2));
    END LOOP;
    lambda12 := omega12-equatorial_sine*eccentricity*half_arc*integral_longitude;
    IF azimuth=lower_angle OR azimuth=upper_angle THEN EXIT; END IF;
    IF lambda12<longitude THEN lower_angle := azimuth; ELSE upper_angle := azimuth; END IF;
  END LOOP;
  RETURN minor_axis*half_arc*integral_distance;
END;
$$;
REVOKE ALL ON FUNCTION cms_wgs84_distance(double precision,double precision,double precision,double precision) FROM PUBLIC;
