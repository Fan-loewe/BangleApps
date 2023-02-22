{
    let storageFile; 
    
    let currentRecording = "";

    let recordingBuffer = [];
    let recordingsWrittenToFile = 0;
    let MAX_RECORDING_BUFFER_LENGTH = 10*50;


    let entriesWritten = 0;
    let entriesNotTransmittedYet = 0;
    let activeRecorders = [];
    let writeInterval;
    let fileBuffer = "";
    let bluetoothBuffer = "";
  
    let RECORDING_FREQUENCY_HZ = 20;
    let SAVING_FREQUENCY_MS = 20*1000; //every 1 minute
    let TRANSMITTING_FREQUENCY_MS = 20*1000;
    let LINE_SEPARATOR = "\n";
  
    let loadSettings = function() {
        var settings = require("Storage").readJSON("acc_recorder.json", 1) || {};
        settings.period = settings.period || 10;
        if (!settings.file || !settings.file.startsWith("acc_20"))
            settings.recording = false;
        return settings;
    }
  
    let updateSettings = function(settings) {
        require("Storage").writeJSON("acc_recorder.json", settings);
        if (WIDGETS["acc_recorder"]) WIDGETS["acc_recorder"].reload();
    }
  
    let getRecorders = function() {
        var recorders = {
            acc: function() {
                var acc_X = "",
                    acc_Y = "",
                    acc_Z = "",
                    acc_diff = "",
                    acc_mag = "";
  
                function onAcc(acc) {
                    acc_X = acc.x;
                    acc_Y = acc.y;
                    acc_Z = acc.z;
                    acc_diff = acc.diff;
                    acc_mag = acc.mag;
                }
                return {
                    name: "Acc",
                    fields: ["X", "Y", "Z", "diff", "mag"],
                    getValues: () => {
                        var r = [acc_X, acc_Y, acc_Z, acc_diff, acc_mag];
                        acc_X = "";
                        acc_Y = "";
                        acc_Z = "";
                        acc_diff = "";
                        acc_mag = "";
                        return r;
                    },
                    start: () => {
                        Bangle.on('accel', onAcc);
                    },
                    stop: () => {
                        Bangle.removeListener('accel', onAcc);
                    },
                    draw: (x, y) => g.setColor(Bangle.isCompassOn() ? "#0f0" : "#f88").drawImage(atob("DAwBEAKARAKQE4DwHkPqPRGKAEAA"), x, y)
                };
            },
            bat: function() {
                return {
                    name: "BAT",
                    fields: ["Battery Percentage", "Charging"],
                    getValues: () => {
                        return [E.getBattery(), Bangle.isCharging()];
                    },
                    start: () => {},
                    stop: () => {},
                    draw: (x, y) => g.setColor(Bangle.isCharging() ? "#0f0" : "#ff0").drawImage(atob("DAwBAABgH4G4EYG4H4H4H4GIH4AA"), x, y)
                };
            }
        };
        require("Storage").list(/^.*\.acc_recorder\.js$/).forEach(fn => eval(require("Storage").read(fn))(recorders));
        return recorders;
    }
  
    let recordInformation = function() {
        // do recording to buffer (this function is called with RECORDING_FREQUENCY_HZ)
        try {
            currentRecording = getRecordingAsString();
        } catch(e) {
            Bluetooth.println("getRecordingAsString() failed, skip for this time");
            currentRecording = "";
        }

        //fileBuffer += LINE_SEPARATOR+currentRecording; 
        //bluetoothBuffer += LINE_SEPARATOR+currentRecording; 

        /*
        // save to file with SAVING_FREQUENCY_MS
        if(entriesWritten*(1000/RECORDING_FREQUENCY_HZ) >= SAVING_FREQUENCY_MS) {
        writeStringToFileOnBangleJs(fileBuffer);
        entriesWritten = 0;
        fileBuffer = getTableHeader();
        }*/
  
        // if there is bluetooth connection (again)
        if (NRF.getSecurityStatus().connected && currentRecording!="") {
            Bluetooth.println(JSON.stringify({
                t: "info",
                msg: currentRecording
            }));
        }

        // handle current recording and memorize it until there is bluetooth connection again
        else if(currentRecording!="") {
            // add the record to buffer
            console.log("=--------current recording is ", currentRecording);
            recordingBuffer.push(currentRecording);
            // if buffer full
            if(recordingBuffer.length==MAX_RECORDING_BUFFER_LENGTH) {
                recordingBuffer.shift();
                /*
                // store to file
                let file = require("Storage").open("acc_backup.txt", "a");
                for (let record of recordingBuffer) {
                    file.write(`${record}\n`);
                    recordingsWrittenToFile += 1;
                  }
                // make buffer empty again
                recordingBuffer = []
                */
            }
        }
    }

    let uploadBackup = function() {  
        if (NRF.getSecurityStatus().connected) {

            // if recording file not empty
            if(recordingsWrittenToFile!=0) {
                Bluetooth.println("recording buffer file not empty");
                // send recording file first
                var f = require("Storage").open("acc_backup.txt", "r");
                var l = f.readLine();
                while(l!=undefined) {
                    if(l!="\n") {
                        Bluetooth.println(JSON.stringify({
                            t: "info",
                            msg: l
                        }));
                    }
                    l = f.readLine();
                }
                // empty file
                //var f2 = require("Storage").open("acc_backup.txt", "w");
                //f2.write("\n");
                //recordingsWrittenToFile = 0
            }

            // if buffer not empty
            if(recordingBuffer.length!=0) {
                Bluetooth.println("recording buffer not empty");
                // send buffer
                for(recordIdx in recordingBuffer) {
                    Bluetooth.println(JSON.stringify({
                        t: "info",
                        msg: recordingBuffer[recordIdx]
                    }));
                }
                // empty buffer
                recordingBuffer = []
            }
        }
    }

    

    let getTableHeader = function() {
        var fields = ["Time"];
        activeRecorders.forEach(recorder => fields.push.apply(fields, recorder.fields));
        return fields.join(",") + "\n";
    }
  
    let writeStringToFileOnBangleJs = function(text) {
      let recordingFileName = "acc_"+getTimeStampAsString()+".csv";
      let file = require("Storage").open(recordingFileName, "a");
      file.write(text);
    }
  
    let getRecordingAsString = function() {
        if(activeRecorders.length>0) {
            var fields = [Math.round(getTime())];
            activeRecorders.forEach(recorder => fields.push.apply(fields, recorder.getValues()));
            // example output: {t:num, msg:"sfs,sfsf,sf,sfs,sf"}
            return fields.join(",");
        }
        else {
            return "";
        }
    }
  
    let getTimeStampAsString = function() {
      let timestamp = Math.floor(new Date().getTime()/1000)*1000;
      var date = new Date(timestamp).toISOString().slice(0, 19).replace(":", "-").replace(":", "-").replace("T", "-");
      return date;
    }
  
    // Main function
    let reload = function() {
        var settings = loadSettings();
        if (writeInterval) 
            clearInterval(writeInterval);
        writeInterval = undefined;
  
        activeRecorders.forEach(rec => rec.stop());
        activeRecorders = [];
  
        if (settings.recording) {
            // set up recorders
            var recorders = getRecorders(); // TODO: order??
            settings.record.forEach(r => {
                var recorder = recorders[r];
                if (!recorder) {
                    console.log( /*LANG*/ "Recorder for " + E.toJS(r) + /*LANG*/ "+not found");
                    return;
                }
                var activeRecorder = recorder();
                activeRecorder.start();
                activeRecorders.push(activeRecorder);
                // TODO: write field names?
                //entriesWritten = 0;
                //entriesNotTransmittedYet = 0;
                //fileBuffer = getTableHeader();
                //bluetoothBuffer = getTableHeader();
            });
            WIDGETS["acc_recorder"].width = 15 + ((activeRecorders.length + 1) >> 1) * 12; // 12px per recorder
            // open/create file
            if (require("Storage").list(settings.file).length) { // Append
                storageFile = require("Storage").open(settings.file, "a");
                // TODO: what if loaded modules are different??
            } else {
                storageFile = require("Storage").open(settings.file, "w");
            }
            // New file - write headers
            //var fields = ["Time"];
            //activeRecorders.forEach(recorder => fields.push.apply(fields, recorder.fields));
            //storageFile.write(fields.join(",") + "\n");
            // start recording...
            WIDGETS["acc_recorder"].draw();
            //writeInterval = setInterval(writeLog, 1000/RECORDING_FREQUENCY_HZ); 
            setInterval(recordInformation, 1000/RECORDING_FREQUENCY_HZ); 
            setInterval(uploadBackup, 1000 * 10); //every 10 secs send backup 

        } else {
            WIDGETS["acc_recorder"].width = 0;
            storageFile = undefined;
        }
    }

    // add the widget
    WIDGETS["acc_recorder"] = {
        area: "tl",
        width: 0,
        draw: function() {
            if (!writeInterval) return;
            g.reset().drawImage(atob("DRSBAAGAHgDwAwAAA8B/D/hvx38zzh4w8A+AbgMwGYDMDGBjAA=="), this.x + 1, this.y + 2);
            activeRecorders.forEach((recorder, i) => {
                recorder.draw(this.x + 15 + (i >> 1) * 12, this.y + (i & 1) * 12);
            });
        },
        getRecorders: getRecorders,
        reload: function() {
            reload();
            Bangle.drawWidgets(); // relayout all widgets
        },
        setRecording: function(isOn, forceAppend) {
            var settings = loadSettings();
            if (isOn && !settings.recording && !settings.file) {
                settings.file = "acc_"+getTimeStampAsString()+".csv";
            } else if (isOn && !forceAppend && !settings.recording && require("Storage").list(settings.file).length) {
                var logfiles = require("Storage").list(/acc_20*/);
                var newFileName = "acc_"+getTimeStampAsString()+".csv";
                updateSettings(settings);

                var buttons = {
                    /*LANG*/
                    "Yes": "overwrite",
                    /*LANG*/ "No": "cancel"
                };
                if (newFileName) buttons[ /*LANG*/ "New"] = "new";
                buttons[ /*LANG*/ "Append"] = "append";
                return E.showPrompt( /*LANG*/ "Overwrite\n " + settings.file.split("-").slice(-3).join("").split(".")[0] + "?", {
                    title: /*LANG*/ "Acc_recorder",
                    buttons: buttons
                }).then(selection => {
                    if (selection === "cancel") return false; // just cancel
                    if (selection === "overwrite")
                        require("Storage").open(settings.file, "r").erase();
                    if (selection === "new") {
                        settings.file = newFileName;
                        updateSettings(settings);
                    }
                    // if (selection==="append") // we do nothing - all is fine
                    return WIDGETS["acc_recorder"].setRecording(1, true /*force append*/ );
                });
            }
            settings.recording = isOn;
            updateSettings(settings);
            WIDGETS["acc_recorder"].reload();
            return Promise.resolve(settings.recording);
        },
        plotTrack: function(m) { // m=instance of openstmap module
            // Plots the current track in the currently set color
            if (!activeRecorders.length) return; // not recording
            var settings = loadSettings();
            // keep function to draw track in RAM
            function plot(g) {
                "ram";
                var f = require("Storage").open(settings.file, "r");
                var l = f.readLine();
                if (l === undefined) return; // empty file?
                var mp, c = l.split(",");
                var la = c.indexOf("Latitude"),
                    lo = c.indexOf("Longitude");
                if (la < 0 || lo < 0) return; // no GPS!
                l = f.readLine();
                c = [];
                while (l && !c[la]) {
                    c = l.split(",");
                    l = f.readLine(f);
                }
                if (l === undefined) return; // empty file?
                mp = m.latLonToXY(+c[la], +c[lo]);
                g.moveTo(mp.x, mp.y);
                l = f.readLine(f);
                var n = 200; // only plot first 200 points to keep things fast(ish)
                while (l && n--) {
                    c = l.split(",");
                    if (c[la]) {
                        mp = m.latLonToXY(+c[la], +c[lo]);
                        g.lineTo(mp.x, mp.y);
                    }
                    l = f.readLine(f);
                }
            }
            plot(g);
        }
    };
    // load settings, set correct widget width
    reload();
  }