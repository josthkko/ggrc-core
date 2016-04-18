/*
  Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
  Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
  Created By: dan@reciprocitylabs.com
  Maintained By: dan@reciprocitylabs.com
*/

;(function(can, $, Mustache) {

  /*
   sort_index_at_end mustache helper

   Given a list of items with a sort_index property, or a list of
   bindings with instances having a sort_index property, return
   a sort_index value suitable for placing a new item in the list
   at the end when sorted.

   @helper_type string -- use within attribute or outside of element

   @param list a list of objects or bindings
   */
  Mustache.registerHelper("sort_index_at_end", function (list, options) {
    return GGRC.Utils.get_last_index(list);
  });

  /*
   sortable_if mustache helper

   Apply jQuery-UI sortable to the parent element if the supplied value
   is true, or false if the hash has an "inverse" key set to a truthy value

   in the other case (false for not inverse, true for inverse) the sortable
   widget attached to the element will be destroyed if it exists.

   @helper_type attributes -- use within an element tag

   @param val some computed value with a truthy or falsy value
   @param sortable_opts a JSON stringified object of options to pass to sortable
   @hashbparam inverse whether to invert the boolean check of val.
   */
  Mustache.registerHelper("sortable_if", function() {
    var args = can.makeArray(arguments).slice(0, arguments.length - 1);
    var options = arguments[arguments.length - 1];
    var inverse = options.hash && options.hash.inverse;

    return function(el) {
      can.view.live.attributes(el, can.compute(function() {
        var val = Mustache.resolve(args[0]);
        var sortable_opts = args[1];

        if (val ^ inverse) {  //value XOR inverse, one must be true, one false
          $(el).sortable(JSON.parse(sortable_opts || "{}"));
        } else if ($(el).is(".ui-sortable")) {
          $(el).sortable("destroy");
        }
      }));
    };
  });


  Mustache.registerHelper("workflow_owner", function(instance, modal_title, options) {
    if (Mustache.resolve(modal_title).indexOf('New ') === 0) {
      return GGRC.current_user.email;
    }
    else {
      var loader = Mustache.resolve(instance).get_binding('authorizations');
      return $.map(loader.list, function(binding) {
        if (binding.instance.role && binding.instance.role.reify().attr('name') === 'WorkflowOwner') {
          return binding.instance.person.reify().attr('email');
        }
      }).join(', ');
    }
  });


  Mustache.registerHelper("if_cycle_assignee_privileges", function(instance, options) {
    var workflow_dfd;
    var current_user = GGRC.current_user;
    var admin = Permission.is_allowed("__GGRC_ADMIN__");

    if(!options) {
      options = instance;
      instance = options.context;
    }
    instance = Mustache.resolve(instance);

    //short-circuit if admin.
    if(admin) {
      return options.fn(options.contexts);
    }

    workflow_dfd = instance.get_binding("cycle").refresh_instances()
      .then(function(cycle_bindings) {
        return new RefreshQueue().enqueue(cycle_bindings[0].instance.workflow.reify()).trigger();
      }).then(function(workflows) {
        return $.when(
          workflows[0].get_binding("authorizations").refresh_instances(),
          workflows[0].get_binding("owner_authorizations").refresh_instances()
        );
      });

    return Mustache.defer_render("span", function(authorizations, owner_auths) {
      var owner_auth_ids = can.map(owner_auths, function(auth) {
        return auth.instance.person && auth.instance.person.id;
      });
      var all_auth_ids = can.map(authorizations, function(auth) {
        return auth.instance.person && auth.instance.person.id;
      });

      if(~can.inArray(current_user.id, owner_auth_ids)
        || ~can.inArray(current_user.id, all_auth_ids)
        && current_user.id === instance.contact.id) {
        return options.fn(options.contexts);
      } else {
        return options.inverse(options.contexts);
      }
    }, workflow_dfd);
  });


  Mustache.registerHelper("if_task_group_assignee_privileges", function(instance, options) {
    var workflow_dfd;
    var current_user = GGRC.current_user;
    var admin = Permission.is_allowed("__GGRC_ADMIN__");

    if(!options) {
      options = instance;
      instance = options.context;
    }
    instance = Mustache.resolve(instance);

    //short-circuit if admin.
    if(admin) {
      return options.fn(options.contexts);
    }
    if (instance.workflow.id in CMS.Models.Workflow.cache) {
      workflow_dfd = new $.Deferred().resolve(instance.workflow.reify());
    } else {
      workflow_dfd = instance.workflow.reify().refresh();
    }
    workflow_dfd = workflow_dfd.then(function(workflow) {
      return $.when(
        workflow.get_binding("authorizations").refresh_instances(),
        workflow.get_binding("owner_authorizations").refresh_instances()
      );
    });

    return Mustache.defer_render("span", function(authorizations, owner_auths) {
      var owner_auth_ids = can.map(owner_auths, function(auth) {
        return auth.instance.person && auth.instance.person.id;
      });
      var all_auth_ids = can.map(authorizations, function(auth) {
        return auth.instance.person && auth.instance.person.id;
      });
      var task_group_contact_id = instance.contact && instance.contact.id;

      if(~can.inArray(current_user.id, owner_auth_ids)
        || ~can.inArray(current_user.id, all_auth_ids)
        && (current_user.id === task_group_contact_id)) {
        return options.fn(options.contexts);
      } else {
        return options.inverse(options.contexts);
      }
    }, workflow_dfd);
  });


  Mustache.registerHelper("if_can_edit_response", function(instance, status, options) {
    var cycle = Mustache.resolve(instance).cycle.reify();
    var can_edit;

    status = Mustache.resolve(status);
    can_edit = cycle.is_current && ["Finished", "Verified"].indexOf(status) === -1;
    if (can_edit) {
      return options.fn(options.contexts);
    } else {
      return options.inverse(options.contexts);
    }
  });

})(this.can, this.can.$, this.Mustache);
