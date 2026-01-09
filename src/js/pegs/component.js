let platformString = navigator.userAgent;
// $(".log").text(platformString);
let isOBS = platformString.search('OBS');
if (isOBS > -1) {
  $("html").addClass("obs")
}