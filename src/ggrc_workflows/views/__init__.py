# Copyright (C) 2015 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: dan@reciprocitylabs.com
# Maintained By: urban@reciprocitylabs.com

"""Ggrc workflow module views."""

import json
from datetime import date
from flask import redirect
from flask import render_template
from flask import url_for
from flask import request

from ggrc import db
from ggrc.app import app
from ggrc.login import login_required
from ggrc.views.cron import run_job
from ggrc_workflows import start_recurring_cycles
from ggrc_workflows.models import Workflow
from ggrc_workflows.models import TaskGroupTask
from ggrc_workflows.services import workflow_cycle_calculator


def _get_unstarted_workflows():
  """Get a list of all workflows that should have a cycle started.

  This function is used for fixing failed cycle starts.

  Returns:
    list of workflows that are missing any started cycles.
  """
  return db.session.query(Workflow).filter(
      Workflow.next_cycle_start_date < date.today(),
      Workflow.recurrences.is_(True),
      Workflow.status == 'Active',
  ).all()


def unstarted_cycles():
  """View for showing a list of all cycles that are missing.

  Returns:
    html string that displays all missing cycles.
  """
  workflows = _get_unstarted_workflows()
  return render_template("unstarted_cycles.haml", workflows=workflows)


def start_unstarted_cycles():
  """Start missing cycles.

  This function is used for fixing workflow cycles if that  have not been
  automatically started in the nightly cronjob. It should be manually triggered
  by a system administrator.
  """
  workflows = _get_unstarted_workflows()
  for workflow in workflows:
    tasks_start_days = [task.relative_start_day
                        for tg in workflow.task_groups
                        for task in tg.task_group_tasks]

    tasks_end_days = [task.relative_end_day
                      for tg in workflow.task_groups
                      for task in tg.task_group_tasks]

    # We must skip tasks that don't have start days and end days defined
    if ((not all(tasks_start_days) and not all(tasks_end_days)) or
            (not tasks_start_days and not tasks_end_days)):
      app.logger.info(
          "Skipping workflow {0} (ID: {1}) because it doesn't "
          "have relative start and end days specified".format(
              workflow.title,
              workflow.id))
      continue

    workflow.next_cycle_start_date = date.today()
    workflow.non_adjusted_next_cycle_start_date = date.today()
    db.session.add(workflow)
  db.session.commit()
  run_job(start_recurring_cycles)
  return redirect(url_for('unstarted_cycles'))


def calculate_absolute_dates():
  relative_dates = {}
  relative_dates['relative_start_month'] = request.args \
      .get('relative_start_month')
  relative_dates['relative_start_day'] = request.args.get('relative_start_day')
  relative_dates['relative_end_month'] = request.args.get('relative_end_month')
  relative_dates['relative_end_day'] = request.args.get('relative_end_day')
  relative_dates['workflow_id'] = request.args.get('workflow_id')

  task = TaskGroupTask(
      relative_start_month=relative_dates['relative_start_month'],
      relative_start_day=relative_dates['relative_start_day'],
      relative_end_month=relative_dates['relative_end_month'],
      relative_end_day=relative_dates['relative_end_day'],
  )
  workflow = Workflow.query.filter_by(
      id=relative_dates['workflow_id']).first()
  calculator = workflow_cycle_calculator.get_cycle_calculator(workflow)
  start_date, end_date = calculator.task_date_range(task)
  return app.make_response((json.dumps({
      'start_date': str(start_date),
      'end_date': str(end_date)
  }), 200, [("Content-Type", "application/json")]))


def init_extra_views(app_):
  """Init all views neede for ggrc_workflows module.

  Args:
    app: current flask application.
  """
  app_.add_url_rule(
      "/admin/unstarted_cycles",
      view_func=login_required(unstarted_cycles))

  app_.add_url_rule(
      "/admin/start_unstarted_cycles",
      view_func=login_required(start_unstarted_cycles))

  app_.add_url_rule(
      "/admin/ensure_backlog_workflow_exists",
      view_func=Workflow.ensure_backlog_workflow_exists)

  app_.add_url_rule(
      "/workflows/calculate_absolute_dates",
      view_func=login_required(calculate_absolute_dates))
