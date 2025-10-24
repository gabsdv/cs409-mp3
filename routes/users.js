const User = require('../models/user');
const Task = require('../models/task');



module.exports = function(router) {
    const usersRoute = router.route('/users');


    usersRoute.get(async function(req, res) {
        try {
            const where = req.query.where ? JSON.parse(req.query.where) : {};
            const sort = req.query.sort ? JSON.parse(req.query.sort) : {};
            const select = req.query.select ? JSON.parse(req.query.select) : {};
            const skip = req.query.skip ? parseInt(req.query.skip) : 0;
            const limit = req.query.limit ? parseInt(req.query.limit) : null;
            const count = req.query.count === 'true';

            if (count) {
                const userCount = await User.countDocuments(where);
                return res.status(200).json({ message: 'Success.', data: userCount });
            }

            let query = User.find(where).sort(sort).select(select).skip(skip);
            if (limit) query = query.limit(limit);

            const users = await query.exec();
            res.status(200).json({ message: 'Success.', data: users });
        } catch (err) {
            res.status(500).json({ message: 'Error fetching users.', data: {} });
        }
    });


    usersRoute.post(async function(req, res) {
        try {
            if (!req.body.name || !req.body.email) return res.status(400).json({ message: 'Need name and email.', data: {} });

            const existingUser = await User.findOne({ email: req.body.email });
            if (existingUser) return res.status(400).json({ message: 'Email already exists.', data: {} });

            let pendingTasks = req.body.pendingTasks || [];
            if (!Array.isArray(pendingTasks)) pendingTasks = [pendingTasks];


            if (pendingTasks.length > 0) {
                const tasks = await Task.find({ _id: { $in: pendingTasks } });            
                if (tasks.length !== pendingTasks.length) return res.status(400).json({ message: 'One or more task IDs are invalid.', data: {}});

                const alreadyAssigned = tasks.find(task => task.assignedUser && task.assignedUser !== '');
                if (alreadyAssigned) return res.status(400).json({ message: 'Task already assigned to another user.', data: {} });

                const completedTask = tasks.find(task => task.completed === true);
                if (completedTask) return res.status(400).json({ message: 'Cannot add completed tasks to pendingTasks.', data: {}});
            }

            const newUser = new User({
                name: req.body.name,
                email: req.body.email,
                pendingTasks: pendingTasks
            });

            const savedUser = await newUser.save();
            if (savedUser.pendingTasks && savedUser.pendingTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: savedUser.pendingTasks } },
                    { assignedUser: savedUser._id.toString(), assignedUserName: savedUser.name }
                );
            }

            res.status(201).json({ message: 'Success.', data: savedUser });
        } catch (err) {
            res.status(500).json({ message: 'Error creating user.', data: {} });
        }
    });





    const individualUserRoute = router.route('/users/:id');


    individualUserRoute.get(async function(req, res) {
        try {
            const userId = req.params.id;
            const select = req.query.select ? JSON.parse(req.query.select) : {};

            const user = await User.findById(userId).select(select).exec();
            if (!user) return res.status(404).json({ message: 'User not found.', data: {} });
            res.status(200).json({ message: 'Success.', data: user });
        } catch (err) {
            res.status(404).json({ message: 'Error fetching user.', data: {} });
        }
    });


    individualUserRoute.put(async function(req, res) {
        try {
            if (!req.body.name || !req.body.email) return res.status(400).json({ message: 'Need name and email.', data: {} });

            const userId = req.params.id;

            const currentUser = await User.findById(userId);
            if (!currentUser) return res.status(404).json({ message: 'User not found.', data: {} });

            if (req.body.email !== currentUser.email) {
                const existing = await User.findOne({ email: req.body.email });
                if (existing) return res.status(400).json({ message: 'Email already exists.', data: {} });
            }


            const currentPendingTasks = currentUser.pendingTasks || [];
            let newPendingTasks = req.body.pendingTasks || [];
            if (!Array.isArray(newPendingTasks)) newPendingTasks = [newPendingTasks];


            if (newPendingTasks.length > 0) {
                const tasks = await Task.find({ _id: { $in: newPendingTasks } });
                if (tasks.length !== newPendingTasks.length) return res.status(400).json({ message: 'One or more task IDs are invalid.', data: {} });

                const alreadyAssigned = tasks.find(task => 
                    task.assignedUser && 
                    task.assignedUser !== '' && 
                    task.assignedUser.toString() !== userId
                );
                if (alreadyAssigned) return res.status(400).json({ message: 'Task already assigned to another user.', data: {} });

                const completedTask = tasks.find(task => task.completed === true);
                if (completedTask) return res.status(400).json({ message: 'Cannot add completed tasks to pendingTasks.', data: {} });
            }

            const updatedUser = {
                name: req.body.name,
                email: req.body.email,
                pendingTasks: newPendingTasks,
                dateCreated: currentUser.dateCreated
            };

            const user = await User.findByIdAndUpdate(userId, updatedUser, { new: true });
            const currentTasksStr = currentPendingTasks.map(t => t.toString());
            const newTasksStr = newPendingTasks.map(t => t.toString());

            const removedTasks = currentTasksStr.filter(t => !newTasksStr.includes(t));
            await Promise.all(removedTasks.map(taskId => {
                return Task.findByIdAndUpdate(taskId, { assignedUser: '', assignedUserName: 'unassigned' });
            }));


            const addedTasks = newTasksStr.filter(t => !currentTasksStr.includes(t));
            await Promise.all(addedTasks.map(taskId => {
                return Task.findByIdAndUpdate(taskId, { assignedUser: userId, assignedUserName: user.name })
            }));

            res.status(200).json({ message: 'Success.', data: user });
        } catch (err) {
            res.status(404).json({ message: 'Error updating user.', data: {} });
        }
    });


    individualUserRoute.delete(async function(req, res) {
        try {
            const userId = req.params.id;

            const user = await User.findById(userId);
            if (!user) return res.status(204).json({ message: 'User not found.', data: {} });

            await Task.updateMany(
                { assignedUser: userId },
                { assignedUser: '', assignedUserName: 'unassigned' }
            );

            await User.findByIdAndDelete(userId);
            res.status(200).json({ message: 'Success.', data: user });
        } catch (err) {
            res.status(404).json({ message: 'Error deleting user.', data: {} });
        }
    });





    return router;
};