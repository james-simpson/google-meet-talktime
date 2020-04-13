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

let data = [
  ['Ant', 29.9],
  ['Dec', 71.54]
]
const dataCopy = [...data]

let chart = Highcharts.chart('container', {
  chart: {
    type: 'bar',
    spacingRight: 50,
  },

  title: {
    text: null
  },

  tooltip: {
    enabled: false
  },

  credits: {
    enabled: false
  },

  xAxis: {
    type: 'category'
  },
  yAxis: {
    visible: false
  },
  plotOptions: {
    series: {
      showInLegend: false,
      dataLabels: {
        enabled: true,
        formatter: function() {
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
    data: [...data]
  }]
});

const refreshIntervalMs = 1000

var i = 0
setInterval(() => {
  console.log(data)
  let newData = [...dataCopy]
  newData[i][1] += refreshIntervalMs

  /* console.log(newData) */
  chart.series[0].setData(newData);
}, refreshIntervalMs)
