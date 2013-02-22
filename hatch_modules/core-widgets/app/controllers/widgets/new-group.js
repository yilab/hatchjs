//
// Hatch.js is a CMS and social website building framework built in Node.js 
// Copyright (C) 2013 Inventures Software Ltd
// 
// This file is part of Hatch.js
// 
// Hatch.js is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, version 3
// 
// Hatch.js is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
// 
// See the GNU General Public License for more details. You should have received a copy of the GNU
// General Public License along with Hatch.js. If not, see <http://www.gnu.org/licenses/>.
// 
// Authors: Marcus Greenwood, Anatoliy Chakkaev and others
//

action(function show() {
    render();
});

action(function create() {
    req.group.clone(body, function (err, newGroup) {
        if (err) {
            // send the error message
            send({
                code: 500,
                status: 'error',
                icon: 'warning-sign',
                error: err
            });
        } else {
            // TODO: this should be replaced with user.join(group)
            // add user to members of new group to be able to edit it
            this.user.membership.push({
                groupId: newGroup.id,
                role: 'owner',
                joinedAt: new Date,
                state: 'approved'
            });

            this.user.save(function () {
                send({
                    code: 200,
                    redirect: '//' + newGroup.homepage.url
                });
            });
        }
    });
};
