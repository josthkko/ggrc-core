/*!
    Copyright (C) 2016 Google Inc., authors, and contributors <see AUTHORS file>
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
    Created By: jost@reciprocitylabs.com
    Maintained By: jost@reciprocitylabs.com
*/

(function (can, $) {
  'use strict';

  GGRC.Components('relativeToAbsoluteDate', {
    tag: 'relative-to-absolute-date',
    template: '<content></content>',
    scope: {
      instance: null,
      populateAbsoluteDate: function (scope, el, ev, val, oldVal) {
        $.getJSON("/workflows/calculate_absolute_dates", {
          workflow_id: scope.instance.workflow.id,
          relative_start_day: scope.instance.relative_start_day,
          relative_start_month: scope.instance.relative_start_month,
          relative_end_day: scope.instance.relative_end_day,
          relative_end_month: scope.instance.relative_end_month
        }).then(function (data) {
          scope.instance.attr('start_date', data.start_date);
          scope.instance.attr('end_date', data.end_date);
        });
      }
    },
    events: {
      inserted: function () {
        this.scope.populateAbsoluteDate(this.scope);
      }
    }
  });
})(window.can, window.can.$);
