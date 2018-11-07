'use strict';

var Promise = require('es6-promise');
var commons = require('./_common.js');

/**
 * Processes an array of data and calls an `onComplete` callback with `error` and `spikes` parameters.
 *
 * @example
 ```js
 slayer()
 .fromArray(arrayData, function(err, spikes){
    if (err){
      console.error(err);
      return;
    }

    console.log(spikes);   // { x: 4, y: 12, id: '21232f297a57a5a743894a0e4a801fc3' }
  });
 ```
 *
 * @api
 * @name Slayer.prototype.fromArray
 * @this {Slayer}
 * @param data {Array.<Object|Number>}
 */
function fromArray(data){
  var self = this;

  if (!Array.isArray(data)){
    throw new TypeError('The data argument should be an array of time series values.');
  }
    
  var spikes = data
    .map(self.getValueY.bind(self))
    .map(self.filterDataItem.bind(self))
    .map(self.algorithm.bind(self, self.config.minPeakDistance))
    .map(commons.objectMapper.bind(self, data))
    .filter(commons.cleanEmptyElement.bind(null, self.config.transformedValueProperty));

    
  let remove_index = [];
  for(let i = 0 ;i < spikes.length - 1;i++){
    if((spikes[i].y === spikes[i + 1].y) && ((spikes[i+1].x - spikes[i].x) < self.config.minPeakDistance)){
        //连续的点最大值是相同的
        remove_index.push(i + 1);
    }       
  }

  if(remove_index.length > 0){
      let new_array = [];
      for(let i = 0;i < spikes.length;i++){
          if(!remove_index.includes(i)){
            new_array.push(spikes[i]);
          }
      }

      return new_array;
  }
  
  return spikes;
}

module.exports = fromArray;
