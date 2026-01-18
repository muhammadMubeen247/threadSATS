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

const formatFeedItem = (doc, userId, repostedOriginalIdSet) => {
  // ✅ Quote repost: show quote content + embedded original
  if (doc.type === 'quote' && doc.repostOf) {
    const original = doc.repostOf;
    const originalId = original?._id?.toString();

    const quote = formatNormalThread(doc, userId);

    return {
      ...quote,
      type: 'quote',
      // show share count of ORIGINAL in the UI
      repostCount: original?.repostCount || 0,
      // embedded original
      quotedThread: formatNormalThread(original, userId),
      // whether current user has reposted the original
      isReposted: userId ? repostedOriginalIdSet.has(originalId) : false,
    };
  }

  // If it's a repost, return original content but with repost metadata
  if (doc.type === 'repost' && doc.repostOf) {
    const original = doc.repostOf;

    const base = formatNormalThread(original, userId);
    const originalId = original?._id?.toString();

    return {
      ...base,
      type: 'repost',
      repost: {
        id: doc._id,
        createdAt: doc.createdAt,
      },
      repostedBy: formatAuthor(doc.author),
      isReposted: userId ? repostedOriginalIdSet.has(originalId) : false,
    };
  }

  // Normal thread
  const base = formatNormalThread(doc, userId);
  const id = doc?._id?.toString();
  return {
    ...base,
    isReposted: userId ? repostedOriginalIdSet.has(id) : false,
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
        populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // If logged in, compute isReposted for originals in this page
    const originals = threads
      .map((t) => (t.type === 'repost' ? t.repostOf?._id : t._id))
      .filter(Boolean);

    const repostedOriginalIdSet = new Set();
    if (req.user && originals.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        author: req.user.id,
        repostOf: { $in: originals },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedOriginalIdSet.add(r.repostOf.toString());
    }

    // If original author is blocked, drop repost item (extra safety)
    const formatted = threads
      .filter((t) => {
        if (t.type !== 'repost') return true;
        const originalAuthorId = t.repostOf?.author?._id?.toString();
        if (!originalAuthorId) return false;
        return !excludedUserIds.some((x) => x.toString() === originalAuthorId);
      })
      .map((t) => formatFeedItem(t, req.user?.id, repostedOriginalIdSet));

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
        populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // originals in this page (for isReposted)
    const originals = docs
      .map((t) => (t.type === 'repost' || t.type === 'quote' ? t.repostOf?._id : t._id))
      .filter(Boolean);

    const repostedOriginalIdSet = new Set();
    if (req.user && originals.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        author: req.user.id,
        repostOf: { $in: originals },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedOriginalIdSet.add(r.repostOf.toString());
    }

    // drop repost/quote if original missing/deleted
    const formattedThreads = docs
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, req.user?.id, repostedOriginalIdSet));

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
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    const thread = await Thread.findOne({
      _id: threadId,
      isDeleted: false,
    }).populate('author', 'username profilePic rollNumber department batch');

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    // Format response
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

    if (!thread.isAnonymous && thread.author) {
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

    if (req.user) {
      responseThread.isLiked = thread.likes.some(
        (likeId) => likeId.toString() === req.user.id
      );
      responseThread.isOwner = thread.author._id.toString() === req.user.id;
    }

    res.status(200).json({
      success: true,
      thread: responseThread,
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({
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

    // ✅ Prevent reposting a repost (or any non-thread type)
    if (original.type && original.type !== 'thread') {
      return res.status(400).json({
        success: false,
        message: 'You can only repost an original thread',
      });
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

    const original = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id type repostCount');
    if (!original) {
      return res.status(404).json({ success: false, message: 'Thread not found' });
    }

    // Only allow quoting ORIGINAL threads
    if (original.type && original.type !== 'thread') {
      return res.status(400).json({ success: false, message: 'You can only quote an original thread' });
    }

    const quote = await Thread.create({
      type: 'quote',
      repostOf: threadId,
      author: req.user.id,
      content: text,
      isAnonymous: false,
      images: [],
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: 1 } });

    // populate for response
    await quote.populate('author', 'username profilePic rollNumber department batch');
    await quote.populate({
      path: 'repostOf',
      populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
    });

    // for isReposted flag on original (for current user)
    const repostedOriginalIdSet = new Set();
    const myRepost = await Thread.findOne({
      type: 'repost',
      author: req.user.id,
      repostOf: threadId,
      isDeleted: false,
    }).select('_id');
    if (myRepost) repostedOriginalIdSet.add(threadId.toString());

    return res.status(201).json({
      success: true,
      message: 'Quote repost created',
      thread: formatFeedItem(quote, req.user.id, repostedOriginalIdSet),
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
        populate: { path: 'author', select: 'username profilePic rollNumber department batch' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const originals = threads
      .map((t) => (t.type === 'repost' ? t.repostOf?._id : t._id))
      .filter(Boolean);

    const repostedOriginalIdSet = new Set();
    if (originals.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        author: req.user.id,
        repostOf: { $in: originals },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedOriginalIdSet.add(r.repostOf.toString());
    }

    const formatted = threads
      .filter((t) => t.type !== 'repost' || !!t.repostOf) // drop reposts whose original is missing/deleted
      .map((t) => formatFeedItem(t, req.user.id, repostedOriginalIdSet));

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