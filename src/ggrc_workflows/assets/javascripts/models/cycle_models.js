/*!
    Copyright (C) 2014 Google Inc., authors, and contributors <see AUTHORS file>
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
    Created By: dan@reciprocitylabs.com
    Maintained By: dan@reciprocitylabs.com
*/


(function(can) {

  var _mustache_path,
      overdue_compute;

  overdue_compute = can.compute(function(val) {
    if (this.attr("status") === "Verified") {
      return "";
    }
    var date = moment(this.attr("next_due_date") || this.attr("end_date"));
    if(date && date.isBefore(new Date())){
      return "overdue";
    }
    return "";
  });

  function refresh_attr(instance, attr){
    if (instance.attr(attr).reify().selfLink) {
      instance.attr(attr).reify().refresh();
    }
  }

  function refresh_attr_wrap(attr){
    return function(ev, instance) {
      if (instance instanceof this) {
        refresh_attr(instance, attr);
      }
    };
  }

  function populateFromWorkflow(form, workflow) {
    if (!workflow || typeof workflow === 'string') {
      // We need to invalidate the form, so we remove workflow if it's not set
      form.removeAttr('workflow');
      return;
    }
    if (workflow.reify) {
      workflow = workflow.reify();
    } else {
      console.log("Can't reify workflow");
      return;
    }
    if (typeof workflow.cycles === undefined || !workflow.cycles) {
      $(document.body).trigger(
        "ajax:flash"
        , {warning: "No cycles in the workflow!"}
      );
      return;
    }

    workflow.refresh_all('cycles').then(function (cycleList) {
      var activeCycleList = _.filter(cycleList, {is_current: true});
      var activeCycle;

      if (!activeCycleList.length) {
        $(document.body).trigger(
          "ajax:flash"
          , {warning: "No active cycles in the workflow!"}
        );
        return;
      }
      activeCycleList = _.sortByOrder(
        activeCycleList, ['start_date'], ['desc']);
      activeCycle = activeCycleList[0];
      form.attr('workflow', {id: workflow.id, type: 'Workflow'});
      form.attr('context', {id: workflow.context.id, type: 'Context'});
      form.attr('cycle', {id: activeCycle.id, type: 'Cycle'});
      form.cycle_task_group = activeCycle.cycle_task_groups[0].id;
    });
  }

  _mustache_path = GGRC.mustache_path + "/cycles";
  can.Model.Cacheable("CMS.Models.Cycle", {
    root_object: "cycle",
    root_collection: "cycles",
    category: "workflow",
    findAll: "GET /api/cycles",
    findOne: "GET /api/cycles/{id}",
    create: "POST /api/cycles",
    update: "PUT /api/cycles/{id}",
    destroy: "DELETE /api/cycles/{id}",

    attributes: {
      workflow: "CMS.Models.Workflow.stub",
      cycle_task_groups: "CMS.Models.CycleTaskGroup.stubs",
      modified_by: "CMS.Models.Person.stub",
      context: "CMS.Models.Context.stub"
    },

    tree_view_options: {
      show_view: _mustache_path + "/tree.mustache",
      header_view : _mustache_path + "/tree_header.mustache",
      draw_children: true,
      child_options: [
        {
          model: "CycleTaskGroup",
          mapping: "cycle_task_groups",
          allow_creating: false
        }
      ]
    },
    init: function(){
      var that = this;
      this._super.apply(this, arguments);
      this.bind("created", refresh_attr_wrap('workflow').bind(this));
      this.bind("destroyed", function(ev, inst) {
        if(inst instanceof that) {
          can.each(inst.cycle_task_groups, function(cycle_task_group) {
            if (!cycle_task_group) {
              return;
            }
            cycle_task_group = cycle_task_group.reify();
            can.trigger(cycle_task_group, "destroyed");
            can.trigger(cycle_task_group.constructor, "destroyed", cycle_task_group);
          });
        }
      });
    }
  }, {
    init: function() {
      var that = this;
      this._super.apply(this, arguments);
      this.bind("status", function(ev, newVal) {
        if (newVal === 'Verified') {
          new RefreshQueue().enqueue(this.workflow.reify()).trigger().then(function(wfs) {
            return wfs[0].get_binding("owners").refresh_instances();
          }).then(function(wf_owner_bindings) {
            var current_user = CMS.Models.get_instance(GGRC.current_user);
            if(~can.inArray(
              current_user,
              can.map(wf_owner_bindings, function(wf_owner_binding) {
                return wf_owner_binding.instance;
              })
            )) {
              that.refresh().then(function() {
                if(that.attr("is_current")) {
                  that.attr("is_current", false);
                  that.save();
                }
              });
            }
          });
        }
      });
    },
    overdue: overdue_compute,
  });

  _mustache_path = GGRC.mustache_path + "/cycle_task_entries";
  can.Model.Cacheable("CMS.Models.CycleTaskEntry", {
    root_object: "cycle_task_entry",
    root_collection: "cycle_task_entries",
    category: "workflow",
    findAll: "GET /api/cycle_task_entries",
    findOne: "GET /api/cycle_task_entries/{id}",
    create: "POST /api/cycle_task_entries",
    update: "PUT /api/cycle_task_entries/{id}",
    destroy: "DELETE /api/cycle_task_entries/{id}",

    attributes: {
      cycle_task_group_object_task: "CMS.Models.CycleTaskGroupObjectTask.stub",
      modified_by: "CMS.Models.Person.stub",
      context: "CMS.Models.Context.stub",
      object_documents: "CMS.Models.ObjectDocument.stubs",
      documents: "CMS.Models.Document.stubs",
      cycle: "CMS.Models.Cycle.stub"
    },

    tree_view_options: {
      show_view: _mustache_path + "/tree.mustache",
      footer_view: _mustache_path + "/tree_footer.mustache",
      child_options: [{
        //0: Documents
        model: "Document",
        mapping: "documents",
        show_view: _mustache_path + "/documents.mustache",
        footer_view: _mustache_path + "/documents_footer.mustache"
      }],
    },
    init: function(){
      this._super.apply(this, arguments);
      this.bind("created",
        refresh_attr_wrap("cycle_task_group_object_task").bind(this));
      this.validateNonBlank("description");
    }
  }, {
    workflowFolder: function() {
      return this.refresh_all('cycle', 'workflow').then(function(workflow){
        if (workflow.has_binding('folders')) {
          return workflow.refresh_all('folders').then(function(folders){
            if (folders.length === 0) {
              return null;  // workflow folder has not been assigned
            }
            return folders[0].instance;
          }, function(result) {
            return result;
          });
        }
      });
    }
  });


  _mustache_path = GGRC.mustache_path + "/cycle_task_groups";
  can.Model.Cacheable("CMS.Models.CycleTaskGroup", {
    root_object: "cycle_task_group",
    root_collection: "cycle_task_groups",
    category: "workflow",
    findAll: "GET /api/cycle_task_groups",
    findOne: "GET /api/cycle_task_groups/{id}",
    create: "POST /api/cycle_task_groups",
    update: "PUT /api/cycle_task_groups/{id}",
    destroy: "DELETE /api/cycle_task_groups/{id}",

    attributes: {
      cycle: "CMS.Models.Cycle.stub",
      task_group: "CMS.Models.TaskGroup.stub",
      cycle_task_group_tasks: "CMS.Models.CycleTaskGroupObjectTask.stubs",
      modified_by: "CMS.Models.Person.stub",
      context: "CMS.Models.Context.stub"
    },

    tree_view_options: {
      sort_property: 'sort_index',
      show_view: _mustache_path + "/tree.mustache",
      //footer_view: _mustache_path + "/tree_footer.mustache",
      draw_children: true,
      child_options: [
        {
          title: 'Tasks',
          model: "CycleTaskGroupObjectTask",
          mapping: "cycle_task_group_tasks",
          allow_creating: false
        }
      ]
    },

    init: function() {
      var that = this;
      this._super.apply(this, arguments);

      this.validateNonBlank("contact");
      this.validateContact(["_transient.contact", "contact"]);
      this.bind("updated", function(ev, instance) {
        if (instance instanceof that) {
          var dfd = instance.refresh_all_force('cycle', 'workflow');
          dfd.then(function(){
            return $.when(
              instance.refresh_all_force('related_objects'),
              instance.refresh_all_force('cycle_task_group_tasks')
            );
          });
        }
      });
      this.bind("destroyed", function(ev, inst) {
        if(inst instanceof that) {
          can.each(inst.cycle_task_group_tasks, function(ctgt) {
            if (!ctgt) {
              return;
            }
            ctgt = ctgt.reify();
            can.trigger(ctgt, "destroyed");
            can.trigger(ctgt.constructor, "destroyed", ctgt);
          });
        }
      });
    }
  }, {
    overdue: overdue_compute
  });

  _mustache_path = GGRC.mustache_path + "/cycle_task_group_object_tasks";
  can.Model.Cacheable("CMS.Models.CycleTaskGroupObjectTask", {
    root_object: "cycle_task_group_object_task",
    root_collection: "cycle_task_group_object_tasks",
    category: "workflow",
    findAll: "GET /api/cycle_task_group_object_tasks",
    findOne: "GET /api/cycle_task_group_object_tasks/{id}",
    create: "POST /api/cycle_task_group_object_tasks",
    update: "PUT /api/cycle_task_group_object_tasks/{id}",
    destroy: "DELETE /api/cycle_task_group_object_tasks/{id}",
    title_singular: "Cycle Task",
    attributes: {
      cycle_task_group: "CMS.Models.CycleTaskGroup.stub",
      task_group_task: "CMS.Models.TaskGroupTask.stub",
      cycle_task_entries: "CMS.Models.CycleTaskEntry.stubs",
      modified_by: "CMS.Models.Person.stub",
      contact: "CMS.Models.Person.stub",
      context: "CMS.Models.Context.stub",
      cycle: "CMS.Models.Cycle.stub"
    },
    permalink_options: {
      url: "<%= base.viewLink %>#current_widget/cycle/<%= instance.cycle.id %>/cycle_task_group/<%= instance.cycle_task_group.id %>/cycle_task_group_object_task/<%= instance.id %>",
      base: "cycle:workflow"
    },
    info_pane_options: {
      mapped_objects: {
        model: can.Model.Cacheable,
        mapping: 'info_related_objects',
        show_view: GGRC.mustache_path + '/base_templates/subtree.mustache'
      }
    },
    tree_view_options: {
      sort_property: 'sort_index',
      show_view: _mustache_path + "/tree.mustache",
      attr_list: [
        {attr_title: 'Title', attr_name: 'title'},
        {attr_title: 'Workflow', attr_name: 'workflow', attr_sort_field: 'cycle.workflow.title'},
        {attr_title: 'State', attr_name: 'status'},
        {attr_title: 'Assignee', attr_name: 'assignee', attr_sort_field: 'contact.name|email'},
        {attr_title: 'Start Date', attr_name: 'start_date'},
        {attr_title: 'End Date', attr_name: 'end_date'},
        {attr_title: 'Last Updated', attr_name: 'updated_at'}
      ],
      display_attr_names: ['title', 'assignee', 'start_date'],
      mandatory_attr_name: ['title'],
      draw_children: true,
      child_options: [
        {
          model: "CycleTaskEntry",
          mapping: "cycle_task_entries",
          allow_creating: true
        },
        {
          model: can.Model.Cacheable,
          mapping: 'info_related_objects',
          allow_creating: true
        }
      ]
    },
    init: function() {
      var that = this;
      this._super.apply(this, arguments);
      this.validateNonBlank("title");
      this.validateNonBlank("workflow");
      this.validateNonBlank("cycle");
      this.validateContact(["_transient.contact", "contact"]);
      this.validateNonBlank("start_date");
      this.validateNonBlank("end_date");

      this.bind("updated", function (ev, instance) {
        if (instance instanceof that) {
          instance.refresh_all_force('related_objects').then(function (object) {
            return instance.refresh_all_force('cycle_task_group', 'cycle', 'workflow');
          });
        }
      });
    }
  }, {
    overdue: overdue_compute,
    _workflow: function () {
      return this.refresh_all('cycle', 'workflow').then(function (workflow) {
        return workflow;
      });
    },
    set_properties_from_workflow: function (workflow) {
      // The form sometimes returns plaintext instead of object, return in that case
      if (typeof workflow === 'string') {
        return;
      }
      populateFromWorkflow(this, workflow);
    },
    before_save: function () {
      // just save the pending joins before we resolve them so we can copy
      // them over to the template task
      this.stored_pending_joins = this._pending_joins;
    },
    after_create: function () {
      var cycleTask = this;

      // create a template task if we selected the checkbox
      if (this.make_recurring === true) {
        this.get_binding('cycle_task_group').refresh_instances()
          .then(function (CycleTaskGroup) {
            var task;
            var taskGroup = CycleTaskGroup[0].instance.task_group;
            var taskData = {
              _pending_joins: cycleTask.stored_pending_joins,
              contact: cycleTask.contact,
              context: cycleTask.context,
              description: cycleTask.description,
              end_date: cycleTask.end_date,
              sort_index: "0",
              start_date: cycleTask.start_date,
              task_group: taskGroup,
              task_type: cycleTask.task_type,
              title: cycleTask.title,
              workflow: cycleTask.workflow,
              relative_start_day: cycleTask.relative_start_day,
              relative_start_month: cycleTask.relative_start_month,
              relative_end_day: cycleTask.relative_end_day,
              relative_end_month: cycleTask.relative_end_month
            };

            if (taskData.task_type !== 'text') {
              taskData.response_options = cycleTask.response_options;
            }
            task = new CMS.Models.TaskGroupTask(taskData);
            task.save().then(function (newTask) {
              // Connect the new task and cycle task
              cycleTask.attr('task_group_task', {
                id: newTask.id,
                type: 'TaskGroupTask'});
              cycleTask.save();
            });
          });
      }
    },
    after_update: function () {
      var taskGroupId;
      var cycleTask = this;
      // If there is a task associated with this cycle task, move it to the
      // other workflow as well
      if (this.task_group_task !== null &&
          !_.isUndefined(this.task_group_task.id)) {
        CMS.Models.TaskGroupTask
          .findOne({id: cycleTask.task_group_task.id})
          .then(function (task) {
            cycleTask.get_binding('cycle_task_group').refresh_instances()
              .then(function (cycleTaskGroup) {
                taskGroupId = cycleTaskGroup[0].instance.task_group.id;
                task.attr('task_group', {
                  id: taskGroupId,
                  type: 'TaskGroup'
                });
                task.save();
              });
          });
      }
    },
    form_preload: function (newObjectForm) {
      var form = this;
      var workflows;
      var _workflow;
      var cycle;

      if (newObjectForm) {
        // prepopulate dates with default ones
        form.attr("start_date", new Date());
        form.attr("end_date", moment().add({month: 3}).toDate());

        form.attr('isNewObject', true);
        form.attr('relative_start_month', 1);
        form.attr('relative_start_day', 1);
        form.attr('relative_end_month', 1);
        form.attr('relative_end_day', 1);
        form.attr('make_recurring', true);
        // when creating a new task we should be able to choose any workflow
        // to put the task there
        form.attr('allow_all_frequencies', true);

        if (!form.contact) {
          form.attr("contact", {id: GGRC.current_user.id, type: "Person"});
        }

        // using setTimeout to execute this after the modal is loaded
        // so we can see when the workflow is already set and use that one
        setTimeout(function () {
          // if we are creating a task from the workflow page, the preset
          // workflow should be that one
          if (form.workflow !== undefined) {
            populateFromWorkflow(form, form.workflow);
            return;
          }

          workflows = CMS.Models.Workflow.findAll({
            kind: 'Backlog', status: 'Active', __sort: '-created_at'});
          workflows.then(function (workflowList) {
            if (!workflowList.length) {
              $(document.body).trigger(
                "ajax:flash"
                , {warning: "No Backlog workflows found! Contact your administrator to enable this functionality."}
              );
              return;
            }
            _workflow = workflowList[0];
            populateFromWorkflow(form, _workflow);
          });
        }, 0);
      } else {
        cycle = form.cycle.reify();
        if (!_.isUndefined(cycle.workflow)) {
          form.attr('workflow', cycle.workflow.reify());
        }
      }
    },
    object: function () {
      return this.refresh_all('task_group_object', 'object').then(function (object) {
        return object;
      });
    },
    response_options_csv: can.compute(function (val) {
      if(val != null) {
        this.attr("response_options", $.map(val.split(","), $.proxy("".trim.call, "".trim)));
      } else {
        return (this.attr("response_options") || []).join(", ");
      }
    }),

    selected_response_options_csv: can.compute(function(val) {
      if(val != null) {
        this.attr("selected_response_options", $.map(val.split(","), $.proxy("".trim.call, "".trim)));
      } else {
        return (this.attr("selected_response_options") || []).join(", ");
      }
    }),

    get_filter_vals: function () {
      var filter_vals = can.Model.Cacheable.prototype.get_filter_vals;
      var mappings = jQuery.extend({}, this.class.filter_mappings, {
        'task title': 'title'
      });

      var vals = filter_vals.apply(this, [this.class.filter_keys, mappings]);

      try {
        vals['workflows'] = this.cycle.reify().workflow.reify().title;
      } catch (e) {}

      return vals;
    }

  });

})(window.can);
