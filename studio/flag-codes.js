/* ============================================================
   COUNTRY -> ISO CODE, for flag images.

   Rendered as IMAGES, not emoji: regional-indicator flag emoji do not
   render on Windows at all -- Chrome there draws the two letters, so an
   emoji flag would show "US" on the stream machine while looking perfect
   on a Mac. Every code here was verified against flagcdn.

   This file exists so the VERTICAL tale of the tape does not carry a
   second copy of the table. The horizontal tale-of-the-tape.html still
   holds its own inline copy -- it is owned by another workstream and was
   not touched. Whoever next opens that file should delete its inline
   FLAG_CODES and load this instead; until then the two are identical and
   were extracted from it mechanically, not retyped.
   ============================================================ */
window.VGA_FLAG_CODES = Object.fromEntries((
'Afghanistan:af|Albania:al|Algeria:dz|Andorra:ad|Angola:ao|Antigua and Barbuda:ag|Argentina:ar|'+
    'Armenia:am|Australia:au|Austria:at|Azerbaijan:az|Bahamas:bs|Bahrain:bh|Bangladesh:bd|Barbados:'+
    'bb|Belarus:by|Belgium:be|Belize:bz|Benin:bj|Bhutan:bt|Bolivia:bo|Bosnia and Herzegovina:ba|Bot'+
    'swana:bw|Brazil:br|Brunei:bn|Bulgaria:bg|Burkina Faso:bf|Burundi:bi|Cambodia:kh|Cameroon:cm|Ca'+
    'nada:ca|Cape Verde:cv|Central African Republic:cf|Chad:td|Chile:cl|China:cn|Colombia:co|Comoro'+
    's:km|Congo:cg|Costa Rica:cr|Croatia:hr|Cuba:cu|Cyprus:cy|Czechia:cz|Denmark:dk|Djibouti:dj|Dom'+
    'inica:dm|Dominican Republic:do|Ecuador:ec|Egypt:eg|El Salvador:sv|Equatorial Guinea:gq|Eritrea'+
    ':er|Estonia:ee|Eswatini:sz|Ethiopia:et|Fiji:fj|Finland:fi|France:fr|Gabon:ga|Gambia:gm|Georgia'+
    ':ge|Germany:de|Ghana:gh|Greece:gr|Grenada:gd|Guatemala:gt|Guinea:gn|Guinea-Bissau:gw|Guyana:gy'+
    '|Haiti:ht|Honduras:hn|Hungary:hu|Iceland:is|India:in|Indonesia:id|Iran:ir|Iraq:iq|Ireland:ie|I'+
    'srael:il|Italy:it|Ivory Coast:ci|Jamaica:jm|Japan:jp|Jordan:jo|Kazakhstan:kz|Kenya:ke|Kiribati'+
    ':ki|Kosovo:xk|Kuwait:kw|Kyrgyzstan:kg|Laos:la|Latvia:lv|Lebanon:lb|Lesotho:ls|Liberia:lr|Libya'+
    ':ly|Liechtenstein:li|Lithuania:lt|Luxembourg:lu|Madagascar:mg|Malawi:mw|Malaysia:my|Maldives:m'+
    'v|Mali:ml|Malta:mt|Marshall Islands:mh|Mauritania:mr|Mauritius:mu|Mexico:mx|Micronesia:fm|Mold'+
    'ova:md|Monaco:mc|Mongolia:mn|Montenegro:me|Morocco:ma|Mozambique:mz|Myanmar:mm|Namibia:na|Naur'+
    'u:nr|Nepal:np|Netherlands:nl|New Zealand:nz|Nicaragua:ni|Niger:ne|Nigeria:ng|North Korea:kp|No'+
    'rth Macedonia:mk|Norway:no|Oman:om|Pakistan:pk|Palau:pw|Palestine:ps|Panama:pa|Papua New Guine'+
    'a:pg|Paraguay:py|Peru:pe|Philippines:ph|Poland:pl|Portugal:pt|Qatar:qa|Romania:ro|Russia:ru|Rw'+
    'anda:rw|Saint Kitts and Nevis:kn|Saint Lucia:lc|Saint Vincent and the Grenadines:vc|Samoa:ws|S'+
    'an Marino:sm|Sao Tome and Principe:st|Saudi Arabia:sa|Senegal:sn|Serbia:rs|Seychelles:sc|Sierr'+
    'a Leone:sl|Singapore:sg|Slovakia:sk|Slovenia:si|Solomon Islands:sb|Somalia:so|South Africa:za|'+
    'South Korea:kr|South Sudan:ss|Spain:es|Sri Lanka:lk|Sudan:sd|Suriname:sr|Sweden:se|Switzerland'+
    ':ch|Syria:sy|Taiwan:tw|Tajikistan:tj|Tanzania:tz|Thailand:th|Timor-Leste:tl|Togo:tg|Tonga:to|T'+
    'rinidad and Tobago:tt|Tunisia:tn|Turkey:tr|Turkmenistan:tm|Tuvalu:tv|Uganda:ug|Ukraine:ua|Unit'+
    'ed Arab Emirates:ae|United Kingdom:gb|United States:us|Uruguay:uy|Uzbekistan:uz|Vanuatu:vu|Vat'+
    'ican City:va|Venezuela:ve|Vietnam:vn|Yemen:ye|Zambia:zm|Zimbabwe:zw'
).split('|').map(p => p.split(':')))

// Only about half the roster has a country. No country -> the caller hides
// the whole row, so a plate closes up rather than leaving a hole where a
// flag would be.
window.VGA_flagUrl = function(country, w){
  const c = window.VGA_FLAG_CODES[String(country ?? '').trim()]
  return c ? `https://flagcdn.com/w${w || 80}/${c}.png` : null
}
