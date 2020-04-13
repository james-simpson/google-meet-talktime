const Highcharts = require('highcharts');

/*
    State and logic
*/

let enabled = false
let joinedMeet = false
let volumeEvents = {}
let talkTimes = {
    // this should be handled better e.g. what if user's language isn't english?
    'You': 0
}

function handleJoinedMeet() {
    joinedMeet = true
}

function handleVolumeEvent(name, volume) {
    if (joinedMeet && name && volume > 0) {
        talkTimes[name] = (talkTimes[name] || 0)

        if (!volumeEvents[name]) {
            volumeEvents[name] = []
        }

        volumeEvents[name].push(volume)
    }
}

function handleParticipantsUpdated(names) {
    for (const name of names) {
        if (!talkTimes[name]) {
            talkTimes[name] = 0
        }
    }
}

function toggleOnOff() {
    enabled = !enabled
    setChartVisibility(enabled)
}

function reset() {
    volumeEvents = {}
    talkTimes = {}
}

// Initialise all the hooks we need for google meet. This allows us to run our functions
// when a volume event is received, or when the video layout handler is called.
setUpGoogleMeetHooks(
    { handleJoinedMeet, handleVolumeEvent, handleParticipantsUpdated}
)

// Every 500ms, get all the volume events received since last poll, identify those that talked
// and update their talk duration accordingly.
const pollInterval = 500

setInterval(() => {
    const talkers = Object.keys(volumeEvents)

    for (const name of talkers) {
        talkTimes[name] = talkTimes[name] || 0
        talkTimes[name] += pollInterval
    }

    updateChart(talkTimes)
    volumeEvents = {}
}, pollInterval)

/*
    UI for the talktime extension
*/

// Create the styles we need
const style = document.createElement('style')
style.innerText = `
    #myChart {
        width: 250px;
        height: 200px;
    }

    .__talk-time-container {
        float: left;
        position: relative;
        font-size: 2em;
        background: white;
        border-radius: 15px;
        padding: 10px;
        z-index: 9999;
        text-align: center;
        margin-left: 15px;
        margin-top: 15px;
        visibility: hidden;
    }
    `

document.body.append(style)

let talkStatsContainer = document.createElement('div')
talkStatsContainer.innerHTML = `
<button id="btnReset" class="__reset-button">Reset</button>
<div id="myChart"></div>
`
talkStatsContainer.classList.add('__talk-time-container')
document.body.appendChild(talkStatsContainer)

document.getElementById('btnReset').onclick = reset

const zeroPad = x => x >= 10 ? x : "0" + x

function msToTime(millisec) {
    let seconds = (millisec / 1000).toFixed(0);
    let minutes = Math.floor(seconds / 60);
    let hours;
    if (minutes > 59) {
        hours = Math.floor(minutes / 60)
        minutes = minutes - (hours * 60);
    }

    seconds = Math.floor(seconds % 60)

    const [h, m, s] = [hours, minutes, seconds].map(zeroPad)
    return hours ?
        `${h}:${m}:${s}` :
        `${m}:${s}`
}

var chart = Highcharts.chart('myChart', {
    chart: {
        type: 'bar',
        spacingRight: 50,
    },

    title: { text: null },
    tooltip: { enabled: false },
    credits: { enabled: false },
    xAxis: {
        type: 'category',
        labels: {
            style: { fontSize: '15px' }
        }
    },
    yAxis: {
        visible: false
    },
    plotOptions: {
        series: {
            showInLegend: false,
            dataLabels: {
                enabled: true,
                formatter: function () {
                    return msToTime(this.y)
                },
            }
        }
    },

    series: [{
        type: 'column',
        dataSorting: {
            enabled: true,
            matchByName: true
        },
        data: [...Object.entries(talkTimes)]
    }]
});

function setChartVisibility(show) {
    const visibility = show ? 'visible' : 'hidden'
    talkStatsContainer.style.visibility = visibility
}

function updateChart(talkTimes) {
    chart.series[0].setData([...Object.entries(talkTimes)]);
}

/*
    Google Meet hooks
*/
function VolumeDetectionProxyHandler(objKey) {
    return {
        apply: function (target, thisArg, argumentsList) {
            if (!thisArg.isDisposed()) {
                if (!thisArg.__talktime_videoElem) {
                    for (let v of Object.values(thisArg)) {
                        if (v instanceof HTMLElement) {
                            thisArg.__talktime_videoElem = v.parentElement.parentElement.parentElement
                        }
                    }
                }

                const name = thisArg.__talktime_videoElem.innerText || thisArg.__talktime_videoElem.textContent
                const volume = thisArg[objKey].getVolume()

                handleVolumeEvent(name, volume)
            }
            return target.apply(thisArg, argumentsList)
        },
    }
}

// This overrides the function that handles laying out video.
// All we do here is install another proxy on the Map that returns which layout to use
function RefreshVideoProxyHandler(objKey, funcKey) {
    return {
        apply: function (target, thisArg, argumentsList) {
            if (!thisArg[objKey].__talktime_initialised) {
                const p = new Proxy(thisArg[objKey], LayoutVideoProxyHandler(thisArg, funcKey))
                p.__talktime_initialised = true
                thisArg[objKey] = p
            }
            return target.apply(thisArg, argumentsList)
        },
    }
}

// This overrides the Map that returns which layout to use, as called by the above Proxy
// We use this to hook into a function that is called each time the video layout 'refreshes',
// giving us access to participant data, specifically names.
function LayoutVideoProxyHandler(parent, funcKey) {
    return {
        get: function (target, name) {
            let ret = Reflect.get(target, name)
            if (typeof ret === 'function') {
                ret = ret.bind(target)
            }

            if (name == 'get') {
                return idx => ({
                    [funcKey]: input => {
                        try {
                            retrieveParticipantData(parent)
                        } catch (e) {
                            console.error('[google-meet-talktime] Error in function that retrieves participant data', e)
                        }

                        return ret(idx)[funcKey](input)
                    },
                })
            }

            return ret
        },
    }
}

// Finds the participant data and calls handleParticipantsUpdated with the participant names
function retrieveParticipantData(inputObject) {
    // Convience function
    const isSpacesStr = i => typeof i === 'string' && i.startsWith('spaces/')

    // Finds the listing of map keys, and the object that contains it
    let videoKeys, importantObject
    for (let v of Object.values(inputObject)) {
        if (v && typeof v === 'object') {
            for (let vv of Object.values(v)) {
                if (Array.isArray(vv) && vv.length && vv.every(isSpacesStr)) {
                    if (videoKeys && vv != videoKeys) {
                        console.log('[google-meet-talktime] Invalid videoKeys search!', videoKeys, vv)
                        throw new Error('Failed')
                    } else {
                        videoKeys = vv
                        importantObject = v
                    }
                }
            }
        }
    }
    if (!importantObject) {
        // We haven't found the object we need to retrieve participant data so stop here.
        // This can happen if you are the only participant on the call.
        return
    }

    // Reusing the object we found earlier, find the map of participant data
    let videoMap
    for (let v of Object.values(importantObject)) {
        if (v instanceof Map && v.size && Array.from(v.keys()).every(isSpacesStr)) {
            videoMap = v
        }
    }

    const participantNames = Array.from(videoMap.values()).map(v => v.name)
    handleParticipantsUpdated(participantNames)
}

function setUpGoogleMeetHooks(
    { handleJoinedMeet, handleVolumeEvent, handleParticipantsUpdated}
) {
    setInterval(() => {
        // Add button
        const ownVideoPreview = document.querySelector('[data-fps-request-screencast-cap]')
        const buttons = ownVideoPreview && ownVideoPreview.parentElement.parentElement.parentElement
        if (buttons && !buttons.__talktime_initialised) {
            buttons.__talktime_initialised = true
    
            handleJoinedMeet()
    
            // Find the button container element and copy the divider
            buttons.prepend(buttons.children[1].cloneNode())
    
            // Add our button to show/hide the chart
            const toggleButton = document.createElement('div')
            toggleButton.classList = buttons.children[1].classList
            toggleButton.classList.add('__gmgv-button')
            toggleButton.style.display = 'flex'
            toggleButton.innerHTML = 'talktime'
            toggleButton.onclick = toggleOnOff
            buttons.prepend(toggleButton)
        }
    
        if (window.default_MeetingsUi) {
            for (let [_k, v] of Object.entries(window.default_MeetingsUi)) {
                if (v && v.prototype) {
                    for (let k of Object.keys(v.prototype)) {
                        const p = Object.getOwnPropertyDescriptor(v.prototype, k)
                        if (p && p.value && !v.prototype[k].__talktime_initialised) {
                            let m
    
                            // this.XX.get(_).YY(this._)
                            m = /this\.([A-Za-z]+)\.get\([A-Za-z]+\)\.([A-Za-z]+)\(this\.[A-Za-z]+\)/.exec(p.value.toString())
                            if (m) {
                                console.log('[google-meet-talktime] Successfully hooked into rendering pipeline', v.prototype[k])
    
                                const p = new Proxy(v.prototype[k], RefreshVideoProxyHandler(m[1], m[2]))
                                p.__talktime_initialised = true
                                v.prototype[k] = p
                            }
    
                            // this.XX.getVolume()
                            m = /this\.([A-Za-z]+)\.getVolume\(\)/.exec(p.value.toString())
                            if (m) {
    
                                console.log('[google-meet-talktime] Successfully hooked into volume detection', v.prototype[k])
                                const p = new Proxy(v.prototype[k], VolumeDetectionProxyHandler(m[1]))
                                p.__talktime_initialised = true
                                v.prototype[k] = p
                            }
                        }
                    }
                }
            }
        }
    }, 250)
}
