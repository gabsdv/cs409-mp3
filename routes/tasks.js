const mongoose = require('mongoose');
const Task = require('../models/task');
const User = require('../models/user');



module.exports = function(router) {
    const tasksRoute = router.route('/tasks');


    tasksRoute.get(async function(req, res) {
        try {
            const where = req.query.where ? JSON.parse(req.query.where) : {};
            const sort = req.query.sort ? JSON.parse(req.query.sort) : {};
            const select = req.query.select ? JSON.parse(req.query.select) : {};
            const skip = req.query.skip ? parseInt(req.query.skip) : 0;
            const limit = req.query.limit ? parseInt(req.query.limit) : 100;
            const count = req.query.count === 'true';

            if (count) {
                const taskCount = await Task.countDocuments(where);
                return res.status(200).json({ message: 'Success.', data: taskCount });
            }

            const query = Task.find(where).sort(sort).select(select).skip(skip).limit(limit);
            const tasks = await query.exec();

            res.status(200).json({ message: 'Success.', data: tasks });
        } catch (err) {
            res.status(500).json({ message: 'Error fetching tasks.', data: {} });
        }
    });


    tasksRoute.post(async function(req, res) {
        try {
            if (!req.body.name || !req.body.deadline) return res.status(400).json({ message: 'Need name and deadline.', data: {} });
            
            const assignedUser = req.body.assignedUser || '';
            let assignedUserName = 'unassigned';
            const completed = req.body.completed || false;

            if (assignedUser && assignedUser !== '') {
                const user = await User.findById(assignedUser);
                if (!user) return res.status(400).json({ message: 'Assigned user does not exist.', data: {} });
                assignedUserName = user.name;
            }

            const newTask = new Task({
                name: req.body.name,
                description: req.body.description || '',
                deadline: req.body.deadline,
                completed,
                assignedUser,
                assignedUserName
            });

            const savedTask = await newTask.save();

            if (savedTask.assignedUser && !savedTask.completed) {
                await User.findByIdAndUpdate(savedTask.assignedUser, { $addToSet: { pendingTasks: savedTask._id } });
            }

            res.status(201).json({ message: 'Success.', data: savedTask });
        } catch (err) {
            res.status(500).json({ message: 'Error creating task.', data: {} });
        }
    });





    const individualTaskRoute = router.route('/tasks/:id');


    individualTaskRoute.get(async function(req, res) {
        try {
            const taskId = req.params.id;
            const select = req.query.select ? JSON.parse(req.query.select) : {};

            const task = await Task.findById(taskId).select(select);
            if (!task) return res.status(404).json({ message: 'Task not found.', data: {} });
            res.status(200).json({ message: 'Success.', data: task });
        } catch (err) {
            res.status(404).json({ message: 'Error fetching task.', data: {} });
        }
    });


    individualTaskRoute.put(async function(req, res) {
        try {
            if (!req.body.name || !req.body.deadline) return res.status(400).json({ message: 'Need name and deadline.', data: {} });

            const taskId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(taskId)) return res.status(404).json({ message: 'Task not found.', data: {} });

            const currentTask = await Task.findById(taskId);
            if (!currentTask) return res.status(404).json({ message: 'Task not found.', data: {} });

            const currentUserId = currentTask.assignedUser;
            let assignedUserName = 'unassigned';
            const newUserId = req.body.assignedUser || '';
            const completed = req.body.completed || false;

            if (newUserId && newUserId !== '') {
                const user = await User.findById(newUserId);
                if (!user) return res.status(400).json({ message: 'Assigned user does not exist.', data: {} });
                assignedUserName = user.name;
            }

            const updatedTask = {
                name: req.body.name,
                description: req.body.description || '',
                deadline: req.body.deadline,
                completed,
                assignedUser: newUserId,
                assignedUserName,
                dateCreated: currentTask.dateCreated
            };

            const task = await Task.findByIdAndUpdate(taskId, updatedTask, { new: true });

            if (currentUserId && currentUserId.toString() !== newUserId.toString()) {
                await User.findByIdAndUpdate(currentUserId, { $pull: { pendingTasks: taskId } });
            }

            if (newUserId) {
                if (!completed) {
                    await User.findByIdAndUpdate(newUserId, { $addToSet: { pendingTasks: taskId } });
                } else {
                    await User.findByIdAndUpdate(newUserId, { $pull: { pendingTasks: taskId } });
                }
            }

            res.status(200).json({ message: 'Success.', data: task });
        } catch (err) {
            res.status(404).json({ message: 'Error updating task.', data: {} });
        }
    });


    individualTaskRoute.delete(async function(req, res) {
        try {
            const taskId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(taskId)) return res.status(404).json({ message: 'Task not found.', data: {} });

            const task = await Task.findById(taskId);
            if (!task) return res.status(204).json({ message: 'Task not found.', data: {} });

            if (task.assignedUser) await User.findByIdAndUpdate(task.assignedUser, { $pull: { pendingTasks: taskId } });

            await Task.findByIdAndDelete(taskId);
            res.status(200).json({ message: 'Success.', data: task });
        } catch (err) {
            res.status(404).json({ message: 'Error deleting task.', data: {} });
        }
    });





    return router;
};