/*
 * Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
 * Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 * Created By: dan@reciprocitylabs.com
 * Maintained By: dan@reciprocitylabs.com
 */

(function($, CMS, GGRC) {
  var WorkflowExtension = {},
      _workflow_object_types = Array.prototype.concat.call([],
        "Program Regulation Policy Standard Contract Clause Section Request".split(" "),
        "Control Objective OrgGroup Vendor AccessGroup".split(" "),
        "System Process DataAsset Product Project Facility Market Issue Assessment".split(" "),
        "Risk Threat".split(" ")
      ),
      _task_sort_function = function(a, b) {
        var date_a = +new Date(a.end_date),
            date_b = +new Date(b.end_date);
        if (date_a === date_b) {
          if (a.id < b.id) {
            return -1;
          } else if (a.id > b.id) {
            return 1;
          } else {
            return 0;
          }
        }
        if (date_a < date_b) {
          return -1;
        } else {
          return 1;
        }
      };

  // Register `workflows` extension with GGRC
  GGRC.extensions.push(WorkflowExtension);

  WorkflowExtension.name = 'workflows';

  // Register Workflow models for use with `infer_object_type`
  WorkflowExtension.object_type_decision_tree = function () {
    return {
      cycle: CMS.Models.Cycle,
      cycle_task_entry: CMS.Models.CycleTaskEntry,
      cycle_task_group: CMS.Models.CycleTaskGroup,
      cycle_task_group_object_task: CMS.Models.CycleTaskGroupObjectTask,
      task_group: CMS.Models.TaskGroup,
      workflow: CMS.Models.Workflow
    };
  };

  // Configure mapping extensions for ggrc_workflows
  WorkflowExtension.init_mappings = function init_mappings() {
    var Proxy = GGRC.MapperHelpers.Proxy;
    var Direct = GGRC.MapperHelpers.Direct;
    var Cross = GGRC.MapperHelpers.Cross;
    var Multi = GGRC.MapperHelpers.Multi;
    var CustomFilter = GGRC.MapperHelpers.CustomFilter;
    var Reify = GGRC.MapperHelpers.Reify;
    var Search = GGRC.MapperHelpers.Search;
    var TypeFilter = GGRC.MapperHelpers.TypeFilter;

    // Add mappings for basic workflow objects
    var mappings = {
      TaskGroup: {
        _canonical: {
          objects: _workflow_object_types.concat(['Cacheable'])
        },
        task_group_tasks: Direct(
          'TaskGroupTask', 'task_group', 'task_group_tasks'),
        objects: Proxy(
          null, 'object', 'TaskGroupObject', 'task_group',
          'task_group_objects'),
        workflow: Direct(
          'Workflow', 'task_groups', 'workflow')
      },

      Workflow: {
        _canonical: {
          task_groups: 'TaskGroup',
          people: 'Person',
          context: 'Context'
        },
        task_groups: Direct(
          'TaskGroup', 'workflow', 'task_groups'),
        tasks: Cross(
          'task_groups', 'task_group_tasks'),
        cycles: Direct(
          'Cycle', 'workflow', 'cycles'),
        previous_cycles: CustomFilter('cycles', function (result) {
          return !result.instance.attr('is_current');
        }),
        current_cycle: CustomFilter('cycles', function (result) {
          return result.instance.attr('is_current');
        }),
        current_task_groups: Cross('current_cycle', 'cycle_task_groups'),
        current_tasks: Cross('current_task_groups', 'cycle_task_group_object_tasks'),
        current_all_tasks: Cross('current_task_groups', 'cycle_task_group_tasks'),

        people: Proxy(
          'Person', 'person', 'WorkflowPerson', 'workflow', 'workflow_people'),
        context: Direct(
          'Context', 'related_object', 'context'),
        authorization_contexts: Multi(['context']),
        authorizations: Cross(
          'authorization_contexts', 'user_roles'),
        authorized_people: Cross(
          'authorization_contexts', 'authorized_people'),
        mapped_and_or_authorized_people: Multi([
          'people', 'authorized_people']),
        roles: Cross('authorizations', 'role'),

        // This is a dummy mapping that ensures the WorkflowOwner role is loaded
        //  before we do the custom filter for owner_authorizations.
        authorizations_and_roles: Multi(['authorizations', 'roles']),
        owner_authorizations: CustomFilter('authorizations_and_roles', function (binding) {
          return binding.instance instanceof CMS.Models.UserRole &&
              binding.instance.attr('role') &&
              binding.instance.role.reify().attr('name') === 'WorkflowOwner';
        }),
        owners: Cross('owner_authorizations', 'person'),
        orphaned_objects: Multi(['cycles', 'task_groups', 'tasks', 'current_task_groups', 'current_tasks'])
      },

      Cycle: {
        cycle_task_groups: Direct(
          'CycleTaskGroup', 'cycle', 'cycle_task_groups'),
        reify_cycle_task_groups: Reify('cycle_task_groups'),
        workflow: Direct('Workflow', 'cycles', 'workflow')
      },

      CycleTaskGroup: {
        cycle: Direct(
          'Cycle', 'cycle_task_groups', 'cycle'),
        cycle_task_group_tasks: Direct(
          'CycleTaskGroupObjectTask',
          'cycle_task_group',
          'cycle_task_group_tasks')
      },

      CycleTaskGroupObjectTask: {
        _canonical: {
          related_objects_as_source: [
            'DataAsset', 'Facility', 'Market', 'OrgGroup', 'Vendor', 'Process',
            'Product', 'Project', 'System', 'Regulation', 'Policy', 'Contract',
            'Standard', 'Program', 'Issue', 'Control', 'Section', 'Clause',
            'Objective', 'Audit', 'Assessment', 'AccessGroup', 'Request',
            'Document', 'Risk', 'Threat'
          ]
        },
        related_objects_as_source: Proxy(
          null, 'destination', 'Relationship', 'source', 'related_destinations'),
        related_objects_as_destination: Proxy(
          null, 'source', 'Relationship', 'destination', 'related_sources'),
        related_objects: Multi(['related_objects_as_source', 'related_objects_as_destination']),
        destinations: Direct('Relationship', 'source', 'related_destinations'),
        sources: Direct('Relationship', 'destination', 'related_sources'),
        relationships: Multi(['sources', 'destinations']),
        related_access_groups: TypeFilter('related_objects', 'AccessGroup'),
        related_data_assets: TypeFilter('related_objects', 'DataAsset'),
        related_facilities: TypeFilter('related_objects', 'Facility'),
        related_markets: TypeFilter('related_objects', 'Market'),
        related_org_groups: TypeFilter('related_objects', 'OrgGroup'),
        related_vendors: TypeFilter('related_objects', 'Vendor'),
        related_processes: TypeFilter('related_objects', 'Process'),
        related_products: TypeFilter('related_objects', 'Product'),
        related_projects: TypeFilter('related_objects', 'Project'),
        related_systems: TypeFilter('related_objects', 'System'),
        related_issues: TypeFilter('related_objects', 'Issue'),
        related_audits: TypeFilter('related_objects', 'Audit'),
        related_controls: TypeFilter('related_objects', 'Control'),
        related_documents: TypeFilter('related_objects', 'Document'),
        related_assessments: TypeFilter('related_objects', 'Assessment'),
        related_requests: TypeFilter('related_objects', 'Request'),
        regulations: TypeFilter('related_objects', 'Regulation'),
        contracts: TypeFilter('related_objects', 'Contract'),
        policies: TypeFilter('related_objects', 'Policy'),
        standards: TypeFilter('related_objects', 'Standard'),
        programs: TypeFilter('related_objects', 'Program'),
        controls: TypeFilter('related_objects', 'Control'),
        sections: TypeFilter('related_objects', 'Section'),
        clauses: TypeFilter('related_objects', 'Clause'),
        objectives: TypeFilter('related_objects', 'Objective'),
        cycle: Direct(
          'Cycle', 'cycle_task_group_object_tasks', 'cycle'),
        cycle_task_group: Direct(
          'CycleTaskGroup',
          'cycle_task_group_object_tasks',
          'cycle_task_group'),
        cycle_task_entries: Direct(
          'CycleTaskEntry',
          'cycle_task_group_object_task',
          'cycle_task_entries'),
        info_related_objects: CustomFilter('related_objects', function (related_objects) {
          return !_.includes(['Comment', 'Document', 'Person'], related_objects.instance.type);
        }),

        // This code needs to be reworked to figure out how to return the single
        // most recent task entry with is_declining_review = true.
        declining_cycle_task_entries: Search(function(binding) {
          return CMS.Models.CycleTaskEntry.findAll({
            cycle_task_group_object_task_id: binding.instance.id,
            is_declining_review: 1
          });
        }, 'Cycle')
      },

      CycleTaskEntry: {
        documents: Proxy(
          'Document', 'document', 'ObjectDocument', 'documentable', 'object_documents'),
        cycle: Direct(
          'Cycle', 'cycle_task_entries', 'cycle'),
        cycle_task_group_object_task: Direct(
          'CycleTaskGroupObjectTask',
          'cycle_task_entries',
          'cycle_task_group_object_task'),
        workflow: Cross('cycle', 'workflow')
      },

      People: {
        _canonical: {
          workflows: 'Workflow'
        },
        workflows: Proxy(
          'Workflow', 'workflow', 'WorkflowPerson', 'person', 'workflow_people'
        )

      },
      Person: {
        assigned_tasks: Search(function (binding) {
          return CMS.Models.CycleTaskGroupObjectTask.findAll({
            contact_id: binding.instance.id,
            'cycle.is_current': true,
            status__in: 'Assigned,InProgress,Finished,Declined'
          });
        }, 'Cycle'),
        assigned_tasks_with_history: Search(function (binding) {
          return CMS.Models.CycleTaskGroupObjectTask.findAll({
            contact_id: binding.instance.id
          });
        }, 'Cycle')
      }
    };

    // Insert `workflows` mappings to all business object types
    can.each(_workflow_object_types, function (type) {
      var model = CMS.Models[type];
      if (model === undefined || model === null) {
        return;
      }
      mappings[type] = {
        task_groups: new GGRC.ListLoaders.ProxyListLoader('TaskGroupObject', 'object', 'task_group', 'task_group_objects', null),
        object_tasks: TypeFilter('related_objects', 'CycleTaskGroupObjectTask'),
        approval_tasks: CustomFilter('object_tasks', function (object) {
          return object.instance.attr('object_approval');
        }),
        workflows: Cross('task_groups', 'workflow'),
        approval_workflows: CustomFilter('workflows', function (binding) {
          return binding.instance.attr('object_approval');
        }),
        current_approval_cycles: Cross('approval_workflows', 'current_cycle'),
        _canonical: {
          workflows: 'Workflow',
          task_groups: 'TaskGroup'
        }
      };
      mappings[type].orphaned_objects = Multi([
        GGRC.Mappings.get_mappings_for(type).orphaned_objects,
        mappings[type].workflows
      ]);

      CMS.Models[type].attributes.task_group_objects = 'CMS.Models.TaskGroupObject.stubs';

      // Also register a render hook for object approval
      GGRC.register_hook(
        type + '.info_widget_actions',
        GGRC.mustache_path + '/base_objects/approval_link.mustache'
        );
    });
    new GGRC.Mappings('ggrc_workflows', mappings);
  };

  // Override GGRC.extra_widget_descriptors and GGRC.extra_default_widgets
  // Initialize widgets for workflow page
  WorkflowExtension.init_widgets = function init_widgets() {
    var pageInstance = GGRC.page_instance();
    var treeWidgets = GGRC.tree_view.base_widgets_by_type;
    var subTrees = GGRC.tree_view.sub_tree_for;

    _.each(_workflow_object_types, function (type) {
      if (!type || !treeWidgets[type]) {
        return;
      }
      treeWidgets[type] = treeWidgets[type].concat(['TaskGroup', 'Workflow',
        'CycleTaskEntry', 'CycleTaskGroupObjectTask', 'CycleTaskGroupObject',
        'CycleTaskGroup']);
      if (!_.isEmpty(subTrees)) {
        subTrees[type].display_list = subTrees[type].display_list
          .concat(['CycleTaskGroupObjectTask']);
        subTrees[type].model_list = subTrees[type].model_list.concat({
          display_name: CMS.Models.CycleTaskGroupObjectTask.title_singular,
          display_status: true,
          model_name: 'CycleTaskGroupObjectTask'});
      }
    });

    if (pageInstance instanceof CMS.Models.Workflow) {
      WorkflowExtension.init_widgets_for_workflow_page();
    } else if (pageInstance instanceof CMS.Models.Person) {
      WorkflowExtension.init_widgets_for_person_page();
    } else {
      WorkflowExtension.init_widgets_for_other_pages();
    }

    WorkflowExtension.init_global();
  };
  WorkflowExtension.init_admin_widgets = function init_admin_widgets() {
    WorkflowExtension.init_global();
  };

  WorkflowExtension.init_widgets_for_other_pages =
      function init_widgets_for_other_pages() {
    var descriptor = {};
    var page_instance = GGRC.page_instance();

    if (page_instance && ~can.inArray(page_instance.constructor.shortName, _workflow_object_types)) {
      descriptor[page_instance.constructor.shortName] = {
        workflow: {
          widget_id: 'workflow',
          widget_name: 'Workflows',
          content_controller: GGRC.Controllers.TreeView,
          content_controller_options: {
            mapping: 'workflows',
            parent_instance: page_instance,
            model: CMS.Models.Workflow,
            show_view: GGRC.mustache_path + '/workflows/tree.mustache',
            footer_view: null,
          }
        },
        task: {
          widget_id: 'task',
          widget_name: 'Workflow Tasks',
          content_controller: GGRC.Controllers.TreeView,
          content_controller_options: {
            mapping: 'object_tasks',
            parent_instance: page_instance,
            model: CMS.Models.CycleTaskGroupObjectTask,
            show_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree.mustache',
            header_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree_header.mustache',
            footer_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree_footer.mustache',
            add_item_view: GGRC.mustache_path +
              '/cycle_task_group_object_tasks/tree_add_item.mustache',
            sort_property: null,
            sort_function: _task_sort_function,
            draw_children: true,
            events: {
              'show-history': function (el, ev) {
                this.options.attr('mapping', el.attr('mapping'));
                this.reload_list();
              }
            },
            child_options: [
              {
                model: CMS.Models.CycleTaskEntry,
                mapping: 'cycle_task_entries',
                show_view: GGRC.mustache_path + '/cycle_task_entries/tree.mustache',
                footer_view: GGRC.mustache_path + '/cycle_task_entries/tree_footer.mustache',
                draw_children: true,
                allow_creating: true
              }
            ]
          }
        }
      };
    }

    new GGRC.WidgetList('ggrc_workflows', descriptor, [
      'info_widget',
      'task_widget'
    ]);
  };

  WorkflowExtension.init_widgets_for_workflow_page =
      function init_widgets_for_workflow_page() {

        var new_widget_descriptors = {};
        var new_default_widgets = [
          'info', 'person', 'task_group', 'current', 'history'
        ];
        var history_widget_descriptor;
        var current_widget_descriptor;
        var object = GGRC.page_instance();

        can.each(GGRC.WidgetList.get_current_page_widgets(), function (descriptor, name) {
          if (~new_default_widgets.indexOf(name)) {
            new_widget_descriptors[name] = descriptor;
          }
        });

        // Initialize controller -- probably this should go in a separate
        // initialization area
        $(document.body).ggrc_controllers_workflow_page();

        GGRC.register_hook(
            'ObjectNav.Actions',
            GGRC.mustache_path + '/dashboard/object_nav_actions');

        $.extend(
          true,
          new_widget_descriptors,
          {
            info: {
              content_controller: GGRC.Controllers.InfoWidget,
              content_controller_options: {
                widget_view: GGRC.mustache_path + '/workflows/info.mustache'
              }
            },
            person: {
              widget_id: 'person',
              widget_name: 'People',
              widget_icon: 'person',
              content_controller: GGRC.Controllers.TreeView,
              content_controller_options: {
                parent_instance: object,
                model: CMS.Models.Person,
                mapping: 'mapped_and_or_authorized_people',
                show_view: GGRC.mustache_path + '/ggrc_basic_permissions/people_roles/authorizations_by_person_tree.mustache',
                footer_view: GGRC.mustache_path + '/wf_people/tree_footer.mustache',
                add_item_view: GGRC.mustache_path + '/wf_people/tree_add_item.mustache'
              }
            },
            task_group: {
              widget_id: 'task_group',
              widget_name: 'Setup',
              widget_icon: 'task_group',
              content_controller: CMS.Controllers.TreeView,
              content_controller_selector: 'ul',
              widget_initial_content: '<ul class="tree-structure new-tree"></ul>',
              content_controller_options: {
                parent_instance: object,
                model: CMS.Models.TaskGroup,
                show_view: GGRC.mustache_path + '/task_groups/tree.mustache',
                sortable: true,
                sort_property: 'sort_index',
                mapping: 'task_groups',
                draw_children: true,

                //note that we are using special naming for the tree views here.
                //  also, tasks for a task group aren't directly mapping to the
                //  tasks themselves but to the join object.  This is important
                //  since the join objects themselves have important attributes.
                child_options: [
                  {
                    model: can.Model.Cacheable,
                    mapping: 'objects',
                    show_view: GGRC.mustache_path + '/base_objects/task_group_subtree.mustache',
                    footer_view: GGRC.mustache_path + '/base_objects/task_group_subtree_footer.mustache',
                    add_item_view: GGRC.mustache_path + '/base_objects/task_group_subtree_add_item.mustache'
                  }, {
                    model: CMS.Models.TaskGroupTask,
                    mapping: 'task_group_tasks',
                    show_view: GGRC.mustache_path + '/task_group_tasks/task_group_subtree.mustache',
                    footer_view: GGRC.mustache_path + '/task_group_tasks/task_group_subtree_footer.mustache',
                    add_item_view: GGRC.mustache_path + '/task_group_tasks/task_group_subtree_add_item.mustache',
                    sort_property: 'sort_index',
                    allow_creating: true
                  }
                ]
              }
            }
          }
    );

        history_widget_descriptor = {
          content_controller: CMS.Controllers.TreeView,
          content_controller_selector: 'ul',
          widget_initial_content: '<ul class="tree-structure new-tree"></ul>',
          widget_id: 'history',
          widget_name: 'History',
          widget_icon: 'history',
          content_controller_options: {
            draw_children: true,
            parent_instance: object,
            model: 'Cycle',
            mapping: 'previous_cycles'
          }
        };
        current_widget_descriptor = {
          content_controller: CMS.Controllers.TreeView,
          content_controller_selector: 'ul',
          widget_initial_content: '<ul class="tree-structure new-tree"></ul>',
          widget_id: 'current',
          widget_name: 'Active Cycles',
          widget_icon: 'cycle',
          content_controller_options: {
            draw_children: true,
            parent_instance: object,
            model: 'Cycle',
            mapping: 'current_cycle',
            header_view: GGRC.mustache_path + '/cycles/tree_header.mustache',
            add_item_view: GGRC.mustache_path +
              '/cycle_task_group_object_tasks/tree_add_item.mustache'
          }
        };
        new_widget_descriptors.history = history_widget_descriptor;
        new_widget_descriptors.current = current_widget_descriptor;

        new GGRC.WidgetList('ggrc_workflows', {Workflow: new_widget_descriptors});
        // Setup extra refresh required due to automatic creation of permissions
        // on creation of WorkflowPerson
        CMS.Models.WorkflowPerson.bind('created', function (ev, instance) {
          if (instance instanceof CMS.Models.WorkflowPerson) {
            instance.context && instance.context.reify().refresh();
          }
        });
      };

  WorkflowExtension.init_widgets_for_person_page =
      function init_widgets_for_person_page() {

        var descriptor = {};
        var page_instance = GGRC.page_instance();

        descriptor[page_instance.constructor.shortName] = {
          task: {
            widget_id: 'task',
            widget_name: 'My Tasks',
            content_controller: GGRC.Controllers.TreeView,

            content_controller_options: {
              parent_instance: GGRC.page_instance(),
              model: CMS.Models.CycleTaskGroupObjectTask,
              show_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree.mustache',
              header_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree_header.mustache',
              footer_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree_footer.mustache',
              add_item_view: GGRC.mustache_path + '/cycle_task_group_object_tasks/tree_add_item.mustache',
              mapping: 'assigned_tasks',
              sort_property: null,
              sort_function: _task_sort_function,
              draw_children: true,
              events: {
                'show-history': function (el, ev) {
                  this.options.attr('mapping', el.attr('mapping'));
                  this.reload_list();
                }
              }
            }
          }
        };
        new GGRC.WidgetList('ggrc_workflows', descriptor, [
          'info_widget',
          'task_widget'
        ]);
      };

  WorkflowExtension.init_global = function () {
    if (!GGRC.current_user || !GGRC.current_user.id) {
      return;
    }

    CMS.Models.Person.findOne({
      id: GGRC.current_user.id
    }).then(function (person) {
      $('.task-count').ggrc_controllers_mapping_count({
        mapping: 'assigned_tasks',
        instance: person
      });
    });
  };

  GGRC.register_hook(
      'LHN.Sections_workflow', GGRC.mustache_path + '/dashboard/lhn_workflows');

  GGRC.register_hook(
      'Dashboard.Widgets', GGRC.mustache_path + '/dashboard/widgets');

  GGRC.register_hook(
      'Dashboard.Errors', GGRC.mustache_path + '/dashboard/info/errors');

  GGRC.register_hook(
    "CycleTaskGroupObjectTask.modal_buttons",
    GGRC.mustache_path + "/cycle_task_group_object_tasks/create_recurring_hook.mustache"
    );

  WorkflowExtension.init_mappings();

  var draft_on_update_mixin = can.Model.Mixin({
  }, {
    before_update: function () {
      if (this.status && this.os_state === 'Approved') {
        this.attr('status', 'Draft');
      }
    }
  });
  can.each(_workflow_object_types, function (modelName) {
    var model = CMS.Models[modelName];
    if (model === undefined || model === null) {
      return;
    }
    draft_on_update_mixin.add_to(model);
  });
})(this.can.$, this.CMS, this.GGRC);
