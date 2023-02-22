Bangle.loadWidgets();
Bangle.drawWidgets();

var settings;

let getTimeStampAsString = function() {
  let timestamp = Math.floor(new Date().getTime()/1000)*1000;
  var date = new Date(timestamp).toISOString().slice(0, 19).replace(":", "-").replace(":", "-").replace("T", "-");
  return date;
}

function loadSettings() {
  settings = require("Storage").readJSON("acc_recorder.json",1)||{};
  var changed = false;
  if (!settings.file) {
    changed = true;
    settings.file = "acc_0.csv";
  }
  if (!Array.isArray(settings.record)) {
    settings.record = ["Acc","bat"];
    changed = true;
  }
  if (changed)
    require("Storage").writeJSON("acc_recorder.json", settings);
}
loadSettings();

function updateSettings() {
  require("Storage").writeJSON("acc_recorder.json", settings);
  if (WIDGETS["acc_recorder"])
    WIDGETS["acc_recorder"].reload();
}

function getTrackNumber(filename) {
  var trackNum = 0;
  var matches = filename.match(/^acc.*\\.csv$/);
  if (matches) {
    trackNum = parseInt(matches[1]||0);
  }
  //var trackNo = filename.match(/^recorder\.log(.*)\.csv$/)[1];
  var trackNo = filename.split(".csv")[0].replace("acc_", "");
  var parts = trackNo.split("-");
  trackNo = parts[3]+parts[4]+parts[5];
  trackNo = parseInt(trackNo);
  return trackNo;
}

function showMainMenu() {
  function menuRecord(id) {
    return {
      value: settings.record.includes(id),
      onchange: v => {
        settings.recording = false; // stop recording if we change anything
        settings.record = settings.record.filter(r=>r!=id);
        if (v) settings.record.push(id);
        updateSettings();
      }
    };
  }
  const mainmenu = {
    '': { 'title': /*LANG*/'Acc recorder' },
    '< Back': ()=>{load();},
    /*LANG*/'RECORD': {
      value: !!settings.recording,
      format: v=>v?/*LANG*/"On":/*LANG*/"Off",
      onchange: v => {
        setTimeout(function() {
          E.showMenu();
          WIDGETS["acc_recorder"].setRecording(v).then(function() {
            print(/*LANG*/"Complete");
            loadSettings();
            print(settings.recording);
            print(settings.file)
            showMainMenu();
          });
        }, 1);
      }
    },
    /*LANG*/'File #': {
      value: getTrackNumber(settings.file),
      min: 0,
      max: 99,
      step: 1,
      onchange: v => {
        settings.recording = false; // stop recording if we change anything
        settings.file = "acc_"+getTimeStampAsString()+".csv";
        updateSettings();
      }
    },
    /*LANG*/'View Tracks': ()=>{viewTracks();},
    /*LANG*/'Time Period': {
      value: settings.period||20,
      min: 1,
      max: 120,
      step: 1,
      format: v=>v+"s",
      onchange: v => {
        settings.recording = false; // stop recording if we change anything
        settings.period = v;
        updateSettings();
      }
    }
  };
  var recorders = WIDGETS["acc_recorder"].getRecorders();
  Object.keys(recorders).forEach(id=>{
    mainmenu[/*LANG*/"Log "+recorders[id]().name] = menuRecord(id);
  });
  delete recorders;
  return E.showMenu(mainmenu);
}



function viewTracks() {
  const menu = {
    '': { 'title': /*LANG*/'Tracks' }
  };
  var found = false;
  require("Storage").list(/^recorder\.log.*\.csv$/,{sf:true}).forEach(filename=>{
    found = true;
    menu[/*LANG*/"Track "+getTrackNumber(filename)] = ()=>viewTrack(filename,false);
  });
  if (!found)
    menu[/*LANG*/"No Tracks found"] = function(){};
  menu['< Back'] = () => { showMainMenu(); };
  return E.showMenu(menu);
}

function getTrackInfo(filename) {
  "ram"
  var starttime, duration=0;
  var f = require("Storage").open(filename,"r");
  if (f===undefined) return;
  var l = f.readLine(f);
  var fields, timeIdx, latIdx, lonIdx;
  var nl = 0, c, n;
  if (l!==undefined) {
    fields = l.trim().split(",");
    timeIdx = fields.indexOf("Time");
    l = f.readLine(f);
  }
  if (l!==undefined) {
    c = l.split(",");
    starttime = parseInt(c[timeIdx]);
  }
  // pushed this loop together to try and bump loading speed a little
  if (c) duration = parseInt(c[timeIdx]) - starttime;
  var screenSize = g.getHeight()-48; // 24 for widgets, plus a border
  var scale = xlen>ylen ? screenSize/xlen : screenSize/ylen;
  return {
    fn : getTrackNumber(filename),
    fields : fields,
    filename : filename,
    time : new Date(starttime*1000),
    records : nl,
    scale : scale,
    duration : Math.round(duration)
  };
}

function asTime(v){
  var mins = Math.floor(v/60);
  var secs = v-mins*60;
  return ""+mins.toString()+"m "+secs.toString()+"s";
}

function viewTrack(filename, info) {
  if (!info) {
    E.showMessage(/*LANG*/"Loading...",/*LANG*/"Track "+getTrackNumber(filename));
    info = getTrackInfo(filename);
  }
  //console.log(info);
  const menu = {
    '': { 'title': /*LANG*/'Track '+info.fn }
  };
  if (info.time)
    menu[info.time.toISOString().substr(0,16).replace("T"," ")] = function(){};
  menu["Duration"] = { value : asTime(info.duration)};
  menu["Records"] = { value : ""+info.records };

  // TODO: steps, heart rate?
  menu[/*LANG*/'Erase'] = function() {
    E.showPrompt(/*LANG*/"Delete Track?").then(function(v) {
      if (v) {
        settings.recording = false;
        updateSettings();
        var f = require("Storage").open(filename,"r");
        f.erase();
        viewTracks();
      } else
        viewTrack(filename, info);
    });
  };
  menu['< Back'] = () => { viewTracks(); };

  return E.showMenu(menu);
}


showMainMenu();
