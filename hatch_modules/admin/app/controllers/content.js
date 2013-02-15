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

var Application = require('./application');
var _ = require('underscore');
var async = require('async');
var moment = require('moment');

module.exports = ContentController;

function ContentController(init) {
    Application.call(this, init);
}

require('util').inherits(ContentController, Application);

/**
 * GET /group/:group_id/content.format
 * respond to JSON, HTML
 */
ContentController.prototype.index = function index(c) {
    c.req.session.adminSection = 'content';
    this.filter = c.req.query.filter;
    var suffix = 'string' === typeof this.filter ? '-' + this.filter : '';
    this.pageName = 'content' + suffix;

    c.respondTo(function(format) {
        format.html(function() {
            c.render();
        });
        format.json(function() {
            loadContent(c, function(posts) {
                posts.forEach(function(post) {
                    post.createdAt = moment(post.createdAt || new Date()).fromNow();
                });

                c.send({
                    sEcho: c.req.query.sEcho || 1,
                    iTotalRecords: posts.count,
                    iTotalDisplayRecords: posts.countBeforeLimit || 0,
                    aaData: posts
                });
            });
        });
    });
};

ContentController.prototype.new = function(c) {
    this.post = new c.Content;
    c.render();
};

// Show the edit blog post form
ContentController.prototype.edit = function edit(c) {
    this.pageName = 'content';
    var post = {};

    if (c.req.params.id) {
        c.Content.find(c.params.id, function(err, content) {
            post = content;
            post.createdAt = moment(post.createdAt ||
                new Date().toString()).format("D-MMM-YYYY HH:mm:ss");
            done();
        });
    } else {
        done();
    }

    function done() {
        c.locals._ = _;
        c.locals.post = post;
        c.render();
    }
};

ContentController.prototype.create = function create(c) {
    var group = this.group;
    var data = c.body.Content;

    // TODO: move to model hook (beforeSave)
    data.updatedAt = new Date();

    // set the groupId and authorId for the new post
    data.groupId = group.id;
    data.authorId = c.req.user.id;
    data.score = 0;

    c.Content.create(data, function(err, content) {
        c.respondTo(function(format) {
            format.json(function () {
                console.log(err);
                console.log(content.errors);
                if (err) {
                    var HelperSet = c.compound.helpers.HelperSet;
                    var helpers = new HelperSet(c);
                    c.send({
                        code: 500,
                        errors: content.errors,
                        html: helpers.errorMessagesFor(content)
                    });
                } else {
                    group.recalculateTagContentCounts(c);
                    c.send({
                        code: 200,
                        html: c.t('models.Content.messages.saved')
                    });
                }
            });
        });

    });
};

// Saves a content record
// TODO: move validation and date parse logic to model
ContentController.prototype.update = function save(c) {
    var Content = c.Content;
    var id = c.req.body.id;
    var group = c.req.group;
    var post = null;
    var data = c.body;

    data.createdAt = data.createdAt;
    data.updatedAt = new Date();

    // validate dates
    if (!data.createdAt) {
        return c.send({
            message: 'Please enter a valid publish date',
            status: 'error',
            icon: 'warning-sign'
        });
    }

    // validate title and text
    if (!data.title || !data.text) {
        return c.send({
            message: 'Please enter a title and some text',
            status: 'error',
            icon: 'warning-sign'
        });
    }

    // build the tags json
    var tags = data.tags || [];
    data.tags = [];

    tags.forEach(function(tag) {
        data.tags.push({
            tagId: group.getTag(tag).id,
            name: tag,
            createdAt: new Date(),
            score: 0
        });
    });

    // build the tag string
    data.tagString = _.pluck(data.tags, 'name').join(', ');

    Content.find(id, function(err, content) {
        post = content;

        // merge tag scores/createdAt from the existing post
        tags.forEach(function(tag) {
            var existing = _.find(content.tags, function(existingTag) {
                return existingTag.name == tag.name
            });
            if (existing) {
                tag.createdAt = existing.createdAt;
                tag.score = existing.score;
            }
        });

        // update the keys manually
        Object.keys(data).forEach(function(key) {
            content[key] = data[key];
        });

        content.save(function (err, content) {
            done();
        });
    });

    function done() {
        // finally, update the group tag counts
        group.recalculateTagContentCounts(c);

        c.send({
            post: post,
            message: 'Post saved successfully',
            status: 'success',
            icon: 'ok'
        });
    }
};

// Delete a content record
ContentController.prototype.destroy = function(c) {
    var group = c.req.group;

    c.Content.find(c.params.id, function(err, content) {
        content.destroy(function(err) {
            // finally, update the group tag counts
            group.recalculateTagContentCounts(c);

            c.send('ok');
        });
    });
};

// Delete multiple content records
// TODO: rename to destroyAll
ContentController.prototype.destroyAll = function(c) {
    var Content = c.Content;
    var group = c.req.group;
    var selectedContent = c.body.selectedContent || [];
    var unselectedContent = c.body.unselectedContent || [];
    var count = 0;

    if (selectedContent.indexOf('all') > -1) {
        loadContent(c, function(posts) {
            selectedContent = _.pluck(posts, 'id');
            selectedContent = _.filter(selectedContent, function(id) {
                return unselectedContent.indexOf(id) == -1;
            });

            deleteSelectedContent(selectedContent);
        });
    } else {
        deleteSelectedContent(selectedContent);
    }

    function deleteSelectedContent(selectedContent) {
        async.forEach(selectedContent, function(id, next) {
            Content.find(id, function(err, content) {
                if (!content) {
                    return next();
                }

                content.destroy(function(err) {
                    count++;
                    next();
                });
            });
        }, function() {
            // finally, update the group tag counts
            group.recalculateTagContentCounts(c);

            c.send({
                message: count + ' posts deleted',
                status: 'success',
                icon: 'ok'
            });
        });
    }
};

// Load content based on the current filter/critera
function loadContent(c, cb) {

    return makeQuery(makeCond(c), cb);

    function makeCond(c) {
        var cond = {
            groupId: c.req.group.id
        };

        var filter = c.req.query.filter || c.req.body.filter;

        if (filter === 'imported') {
            cond.imported = true;
        } else if (typeof filter === 'string' && filter.indexOf("[native code]") === -1) {
            // filter by tag
            if (!isNaN(filter)) {
                cond['tags:tagId'] = filter;
            }
            // filter by content type
            else {
                cond.type = filter;
            }
        }
        return cond;
    }

    function makeQuery(cond, cb) {
        var query = c.req.query;
        var limit = parseInt(query.iDisplayLength || 0, 10);
        var offset = parseInt(query.iDisplayStart || 0, 10);
        var colNames = ['', 'title', 'tagString', 'createdAt', 'score', ''];
        var orderBy = query.iSortCol_0 > 0 ?
            (colNames[query.iSortCol_0] + ' ' + query.sSortDir_0.toUpperCase()) :
            'createdAt DESC';
        var search = query.sSearch || c.req.body.search;

        c.Content.count(cond, function(err, count) {
            if (err) {
                return c.next(err);
            }
            // redis fulltext search
            if (search) {
                c.Content.all({
                    where: cond,
                    fulltext: search,
                    order: orderBy,
                    offset: offset,
                    limit: limit
                }, function(err, posts) {
                    posts.count = count;
                    cb(posts);
                });
            }
            // no filter, standard query
            else {
                c.Content.all({
                    where: cond,
                    order: orderBy,
                    offset: offset,
                    limit: limit
                }, function(err, posts) {
                    posts.count = count;
                    cb(posts);
                });
            }
        });

    }
}
