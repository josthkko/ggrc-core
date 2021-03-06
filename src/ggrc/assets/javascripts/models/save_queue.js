/*!
    Copyright (C) 2016 Google Inc.
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

(function (can, $) {
  /*  GGRC.SaveQueue
   *
   *  SaveQueue is used by CMS.Models.Cacheable to prevent firing
   *  multiple requests to the server at once. It makes sure the requests
   *  are grouped together (inside _queue) and then resolved in batches.
   *
   *  It will also try to group POST request and use the custom collection post
   *  API and then redistribute responses in order to trace in latency for
   *  throughput. This is done by a "thread" (of timeouts) per object type (per
   *  bucket) that enqueues as a regular request but then greedily dispatches
   *  requests that arrived while it was in the queue.
   *
   *  enqueue(obj: CMS.Models.Cacheable, save_args) -> null
   */
  can.Construct('GGRC.SaveQueue', {

    DELAY: 100, // Number of ms to wait before the first batch is fired
    BATCH: GGRC.config.MAX_INSTANCES || 3, // Maximum number of POST/PUT requests at any given time
    BATCH_SIZE: 1000,
    _queue: [],
    _buckets: {},
    _timeout: null,

    _enqueue_bucket: function (bucket) {
      var that = this;
      return function () {
        var size = bucket.background ? bucket.objs.length : that.BATCH_SIZE;
        var objs = bucket.objs.splice(0, size);
        var body = _.map(objs, function (obj) {
          var list = {};
          list[bucket.type] = obj.serialize();
          return list;
        });
        var dfd = $.ajax({
          type: 'POST',
          url: '/api/' + bucket.plural,
          data: body,
          beforeSend: function (xhr) {
            if (bucket.background) {
              xhr.setRequestHeader('X-GGRC-BackgroundTask', 'true');
            }
          }
        }).promise();
        dfd.always(function (data, type) {
          if (type === 'error') {
            can.each(objs, function (obj) {
              obj._dfd.reject(data);
            });
          }
          if ('background_task' in data) {
            return CMS.Models.BackgroundTask.findOne({
              id: data.background_task.id
            }).then(function (task) {
              // Resolve all the dfds with the task
              can.each(objs, function (obj) {
                obj._dfd.resolve(task);
              });
            });
          }

          // Push the response to a queue for later processing.
          bucket.save_responses.push([objs, data]);
        }).always(function () {
          if (bucket.objs.length) {
            that._step(that._enqueue_bucket(bucket));
          } else {
            // Process all of the batches of save responses.
            that._process_save_responses(bucket);
            bucket.in_flight = false;
          }
        });

        return dfd;
      };
    },

    _process_save_responses: function (bucket) {
      can.each(bucket.save_responses, function (resp) {
        var objs = resp[0];
        var data = resp[1];
        var cb = function (single) {
          return function () {
            this.created(single[1][bucket.type]);
            return $.when(
              can.Model.Cacheable.resolve_deferred_bindings(this));
          };
        };
        can.each(objs, function (obj, idx) {
          var single = data[idx];
          // Add extra check to avoid possible exceptions
          single = Array.isArray(single) ? single : false;
          if (single && single[0] >= 200 && single[0] < 300) {
            obj._save(cb(single));
          } else {
            obj._dfd.reject(obj, single);
          }
        });
      });

      bucket.save_responses.length = 0;
    },

    _step: function (elem) {
      this._queue.push(elem);
      if (_.isNumber(this._timeout)) {
        clearTimeout(this._timeout);
      }
      this._timeout = setTimeout(function () {
        new GGRC.SaveQueue(this._queue.splice(0, this._queue.length));
      }.bind(this), this.DELAY);
    },

    enqueue: function (obj, args) {
      var type;
      var bucket;
      var bucketName;
      var plural;
      var elem = function () {
        return obj._save.apply(obj, args);
      };
      if (obj.isNew()) {
        type = obj.constructor.table_singular;
        bucketName = type + (obj.run_in_background ? '_bg' : '');
        bucket = this._buckets[bucketName];

        if (_.isUndefined(bucket)) {
          plural = obj.constructor.table_plural;
          bucket = {
            objs: [],
            type: type,
            plural: plural,
            background: obj.run_in_background,
            // List of batch request responses that are yet to be processed.
            save_responses: [],
            in_flight: false // is there a "thread" running for this bucket
          };
          this._buckets[bucketName] = bucket;
        }
        bucket.objs.push(obj);
        if (bucket.in_flight) {
          return;
        }
        elem = this._enqueue_bucket(bucket);
        bucket.in_flight = true;
      }
      this._step(elem);
    }
  }, {
    init: function (queue) {
      this._queue = queue;
      this._resolve();
    },
    _resolve: function () {
      var objs;
      if (!this._queue.length) {
        // Finished
        return;
      }
      objs = this._queue.splice(0, this.constructor.BATCH);
      $.when.apply($, objs.map(function (fn) {
        return fn.apply(this);
      }.bind(this.constructor))).always(this._resolve.bind(this)); // Move on to the next one
    }
  });
})(window.can, window.can.$);
