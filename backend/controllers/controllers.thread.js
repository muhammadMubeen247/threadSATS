const Thread = require('../models/Thread');
const User = require('../models/User');
const mongoose = require('mongoose');
const { deleteMultipleFromCloudinary } = require('../utils/cloudinary');

const formatAuthor = (u) => ({
  id: u?._id,
  username: u?.username,
  profilePic: u?.profilePic,
  rollNumber: u?.rollNumber,
  department: u?.department,
  batch: u?.batch,
});

const formatNormalThread = (thread, userId) => {
  const t = {
    id: thread._id,
    type: thread.type || 'thread',
    content: thread.content,
    isAnonymous: thread.isAnonymous,
    images: thread.images,
    likes: thread.likes,
    likesCount: thread.likes?.length || 0,
    commentCount: thread.commentCount || 0,
    repostCount: thread.repostCount || 0,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };

  if (!thread.isAnonymous && thread.author) t.author = formatAuthor(thread.author);
  else {
    t.author = { username: 'Anonymous', profilePic: '', department: 'COMSATS Student' };
  }

  if (userId) {
    t.isLiked = (thread.likes || []).some((id) => id.toString() === userId.toString());
    t.isOwner = thread.author?._id?.toString() === userId.toString();
  }

  return t;
};

const resolveDisplayThread = (t) => {
  // If you repost a repost, display the deepest available non-repost.
  // This works as deep as your populate chain provides.
  let cur = t;
  while (cur && cur.type === 'repost' && cur.repostOf && typeof cur.repostOf === 'object') {
    cur = cur.repostOf;
  }
  return cur || t;
};

const formatFeedItem = (doc, userId, repostedTargetIdSet) => {
  const docId = doc?._id?.toString();

  // ✅ Quote repost: show quote content + embedded quoted thread (for display only)
  if (doc.type === 'quote' && doc.repostOf) {
    const quotedDisplay = resolveDisplayThread(doc.repostOf);

    const quote = formatNormalThread(doc, userId);

    return {
      ...quote,
      type: 'quote',
      quotedThread: formatNormalThread(quotedDisplay, userId),
      // ✅ isReposted means: "have I reposted THIS item?"
      isReposted: userId ? repostedTargetIdSet.has(docId) : false,
    };
  }

  // ✅ Simple repost: this is its OWN item (id = repost doc id), embed target for display
  if (doc.type === 'repost' && doc.repostOf) {
    const repost = formatNormalThread(doc, userId);
    const repostedDisplay = resolveDisplayThread(doc.repostOf);

    return {
      ...repost,
      type: 'repost',
      repostedThread: formatNormalThread(repostedDisplay, userId),
      repostedBy: formatAuthor(doc.author), // ✅ add
      isReposted: userId ? repostedTargetIdSet.has(docId) : false,
    };
  }

  // Normal thread
  const base = formatNormalThread(doc, userId);
  return {
    ...base,
    isReposted: userId ? repostedTargetIdSet.has(docId) : false,
  };
};

// @desc    Create a new thread
// @route   POST /api/threads
// @access  Private
exports.createThread = async (req, res) => {
  try {
    const { content, isAnonymous, images } = req.body;

    // Create thread
    const thread = await Thread.create({
      content,
      author: req.user.id,
      isAnonymous: isAnonymous || false,
      images: images || [],
    });

    // Populate author info (needed for response)
    await thread.populate('author', 'username profilePic rollNumber department batch');

    // Prepare response
    const responseThread = {
      id: thread._id,
      content: thread.content,
      isAnonymous: thread.isAnonymous,
      images: thread.images,
      likes: thread.likes,
      likesCount: thread.likesCount,
      commentCount: thread.commentCount,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };

    // Only include author info if not anonymous
    if (!thread.isAnonymous) {
      responseThread.author = {
        id: thread.author._id,
        username: thread.author.username,
        profilePic: thread.author.profilePic,
        rollNumber: thread.author.rollNumber,
        department: thread.author.department,
        batch: thread.author.batch,
      };
    } else {
      responseThread.author = {
        username: 'Anonymous',
        profilePic: '',
        department: 'COMSATS Student',
      };
    }

    res.status(201).json({
      success: true,
      message: 'Thread created successfully',
      thread: responseThread,
    });
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating thread',
      error: error.message,
    });
  }
};

// @desc    Get all threads (homepage feed)
// @route   GET /api/threads
// @access  Public
exports.getAllThreads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let excludedUserIds = [];

    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('blockedUsers');

      const usersWhoBlockedMe = await User.find({
        blockedUsers: req.user.id,
      }).select('_id');

      excludedUserIds = [
        ...currentUser.blockedUsers,
        ...usersWhoBlockedMe.map((u) => u._id),
      ];
    }

    const query = { isDeleted: false };

    // Exclude repost *authors* that are blocked
    if (excludedUserIds.length > 0) {
      query.author = { $nin: excludedUserIds };
    }

    const total = await Thread.countDocuments(query);

    const threads = await Thread.find(query)
      .populate('author', 'username profilePic rollNumber department batch')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'author', select: 'username profilePic rollNumber department batch' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ✅ include quote items too
    const targets = threads.map((t) => t._id).filter(Boolean);

    const repostedTargetIdSet = new Set();
    if (targets.length) { // ✅ was: if (originals.length)
      const myReposts = await Thread.find({
        type: 'repost',
        author: req.user.id,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    // ✅ drop repost/quote if original missing/deleted; also block-check original author for both
    const formatted = threads
      .filter((t) => {
        if (t.type === 'thread') return true;

        // repost/quote must have original
        const originalAuthorId = t.repostOf?.author?._id?.toString();
        if (!originalAuthorId) return false;

        // if original author is blocked, drop it
        return !excludedUserIds.some((x) => x.toString() === originalAuthorId);
      })
      .map((t) => formatFeedItem(t, req.user?.id, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads: formatted,
    });
  } catch (error) {
    console.error('Get threads error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching threads',
      error: error.message,
    });
  }
};

// @desc    Get threads by specific user (for profile page - PUBLIC ONLY)
// @route   GET /api/threads/user/:userId
// @access  Public
exports.getUserThreads = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(userId).select('username profilePic rollNumber department batch');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ✅ include user's public threads + reposts + quote reposts
    const query = {
      author: userId,
      isAnonymous: false,
      isDeleted: false,
      type: { $in: ['thread', 'repost', 'quote'] },
    };

    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('author', 'username profilePic rollNumber department batch')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'author', select: 'username profilePic rollNumber department batch' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // originals in this page (for isReposted)
    const targets = docs.map((t) => t._id).filter(Boolean);

    const repostedTargetIdSet = new Set();
    if (req.user && targets.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        author: req.user.id,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    // drop repost/quote if original missing/deleted
    const formattedThreads = docs
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, req.user?.id, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: formattedThreads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      user: {
        id: user._id,
        username: user.username,
        profilePic: user.profilePic,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
      },
      threads: formattedThreads,
    });
  } catch (error) {
    console.error('Get user threads error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching user threads',
      error: error.message,
    });
  }
};

// @desc    Get single thread by ID
// @route   GET /api/threads/:threadId
// @access  Public
exports.getThreadById = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const doc = await Thread.findOne({ _id: threadId, isDeleted: false })
      .populate('author', 'username profilePic rollNumber department batch')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'author', select: 'username profilePic rollNumber department batch' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
          },
        ],
      })
      .lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Thread not found' });
    }

    // isReposted = "have I reposted THIS item?"
    const repostedTargetIdSet = new Set();
    if (req.user) {
      const myRepost = await Thread.findOne({
        type: 'repost',
        author: req.user.id,
        repostOf: threadId,
        isDeleted: false,
      })
        .select('_id')
        .lean();

      if (myRepost) repostedTargetIdSet.add(threadId.toString());
    }

    return res.status(200).json({
      success: true,
      thread: formatFeedItem(doc, req.user?.id, repostedTargetIdSet),
    });
  } catch (error) {
    console.error('Get thread error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching thread',
      error: error.message,
    });
  }
};

// @desc    Delete a thread
// @route   DELETE /api/threads/:threadId
// @access  Private
exports.deleteThread = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    const thread = await Thread.findOne({
      _id: threadId,
      isDeleted: false,
    });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    // Check if user is the author
    if (thread.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this thread',
      });
    }

    // Delete images from Cloudinary if they exist
    if (thread.images && thread.images.length > 0) {
      const publicIds = thread.images.map((img) => img.publicId);
      try {
        await deleteMultipleFromCloudinary(publicIds);
        console.log(`✅ Deleted ${publicIds.length} images from Cloudinary`);
      } catch (cloudinaryError) {
        console.error('⚠️ Cloudinary deletion error:', cloudinaryError);
        // Continue with thread deletion even if Cloudinary fails
      }
    }

    // Soft delete (mark as deleted instead of removing)
    thread.isDeleted = true;
    await thread.save();

    res.status(200).json({
      success: true,
      message: 'Thread deleted successfully',
    });
  } catch (error) {
    console.error('Delete thread error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting thread',
      error: error.message,
    });
  }
};

// @desc    Like/Unlike a thread
// @route   PUT /api/threads/:threadId/like
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    const thread = await Thread.findOne({
      _id: threadId,
      isDeleted: false,
    });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    const userId = req.user.id;
    const likeIndex = thread.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      thread.likes.splice(likeIndex, 1);
      await thread.save();

      return res.status(200).json({
        success: true,
        message: 'Thread unliked',
        isLiked: false,
        likesCount: thread.likes.length,
      });
    } else {
      // Like
      thread.likes.push(userId);
      await thread.save();

      return res.status(200).json({
        success: true,
        message: 'Thread liked',
        isLiked: true,
        likesCount: thread.likes.length,
      });
    }
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling like',
      error: error.message,
    });
  }
};

// @desc    Repost / Undo repost
// @route   PUT /api/threads/:threadId/repost
// @access  Private
exports.toggleRepost = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const original = await Thread.findOne({ _id: threadId, isDeleted: false }).select(
      '_id repostCount type'
    );
    if (!original) {
      return res.status(404).json({ success: false, message: 'Thread not found' });
    }

    const userId = req.user.id;

    // find active repost (if any)
    const existing = await Thread.findOne({
      type: 'repost',
      repostOf: threadId,
      author: userId,
      isDeleted: false,
    }).select('_id');

    if (existing) {
      // Undo repost
      await Thread.findByIdAndUpdate(existing._id, { isDeleted: true });

      await Thread.findByIdAndUpdate(threadId, {
        $inc: { repostCount: -1 },
      });

      return res.status(200).json({
        success: true,
        message: 'Repost removed',
        isReposted: false,
      });
    }

    // Create repost
    const repost = await Thread.create({
      type: 'repost',
      repostOf: threadId,
      author: userId,
      content: '', // repost itself has no content for now
      isAnonymous: false,
      images: [],
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: 1 } });

    return res.status(201).json({
      success: true,
      message: 'Reposted',
      isReposted: true,
      repostId: repost._id,
    });
  } catch (error) {
    // handle race: unique partial index violation
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Already reposted' });
    }

    console.error('Toggle repost error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while toggling repost',
      error: error.message,
    });
  }
};

// @desc    Create quote repost
// @route   POST /api/threads/:threadId/quote
// @access  Private
exports.createQuoteRepost = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Quote content is required' });
    }

    // ✅ allow quoting ANY existing thread (thread / repost / quote)
    const target = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id');
    if (!target) {
      return res.status(404).json({ success: false, message: 'Thread not found' });
    }

    const quote = await Thread.create({
      type: 'quote',
      repostOf: threadId,          // ✅ quote THIS item
      author: req.user.id,
      content: text,
      isAnonymous: false,
      images: [],
    });

    // ✅ increment repostCount on the quoted target (thread2 in your example)
    await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: 1 } });

    // populate for response (include one more level for repost-of-repost display)
    await quote.populate('author', 'username profilePic rollNumber department batch');
    await quote.populate({
      path: 'repostOf',
      match: { isDeleted: false },
      populate: [
        { path: 'author', select: 'username profilePic rollNumber department batch' },
        {
          path: 'repostOf',
          match: { isDeleted: false },
          populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
        },
      ],
    });

    // ✅ isReposted here means "have I reposted this quote thread?" -> false for a new quote
    const repostedTargetIdSet = new Set();

    return res.status(201).json({
      success: true,
      message: 'Quote repost created',
      thread: formatFeedItem(quote, req.user.id, repostedTargetIdSet),
    });
  } catch (error) {
    console.error('Create quote repost error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating quote repost',
      error: error.message,
    });
  }
};

// @desc    Get personalized feed (from followed users)
// @route   GET /api/threads/feed/following
// @access  Private
exports.getFollowingFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id).select('following');

    if (!user.following || user.following.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        page,
        pages: 0,
        threads: [],
        message: 'Start following users to see their threads here!',
      });
    }

    const baseQuery = {
      author: { $in: user.following },
      isDeleted: false,
    };

    const total = await Thread.countDocuments(baseQuery);

    const threads = await Thread.find(baseQuery)
      .populate('author', 'username profilePic rollNumber department batch')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'author', select: 'username profilePic rollNumber department batch' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ✅ include quote items too
    const targets = threads.map((t) => t._id).filter(Boolean);

    const repostedTargetIdSet = new Set();
    if (targets.length) { // ✅ was: if (originals.length)
      const myReposts = await Thread.find({
        type: 'repost',
        author: req.user.id,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    const formatted = threads
      .filter((t) => t.type === 'thread' || !!t.repostOf)
      .map((t) => formatFeedItem(t, req.user.id, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads: formatted,
    });
  } catch (error) {
    console.error('Get following feed error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching feed',
      error: error.message,
    });
  }
};