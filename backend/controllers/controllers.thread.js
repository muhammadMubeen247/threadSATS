const Thread = require('../models/Thread');
const User = require('../models/User');
const mongoose = require('mongoose');
const { deleteMultipleFromCloudinary } = require('../utils/cloudinary');

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

    // If user is logged in, exclude blocked users
    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('blockedUsers');
      
      // Get users who blocked current user
      const usersWhoBlockedMe = await User.find({
        blockedUsers: req.user.id,
      }).select('_id');

      excludedUserIds = [
        ...currentUser.blockedUsers,
        ...usersWhoBlockedMe.map((u) => u._id),
      ];
    }

    // Build query
    const query = { isDeleted: false };
    
    if (excludedUserIds.length > 0) {
      query.author = { $nin: excludedUserIds };
    }

    const total = await Thread.countDocuments(query);

    const threads = await Thread.find(query)
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedThreads = threads.map((thread) => {
      const formattedThread = {
        id: thread._id,
        content: thread.content,
        isAnonymous: thread.isAnonymous,
        images: thread.images,
        likes: thread.likes,
        likesCount: thread.likes.length,
        commentCount: thread.commentCount,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };

      if (!thread.isAnonymous && thread.author) {
        formattedThread.author = {
          id: thread.author._id,
          username: thread.author.username,
          profilePic: thread.author.profilePic,
          rollNumber: thread.author.rollNumber,
          department: thread.author.department,
          batch: thread.author.batch,
        };
      } else {
        formattedThread.author = {
          username: 'Anonymous',
          profilePic: '',
          department: 'COMSATS Student',
        };
      }

      if (req.user) {
        formattedThread.isLiked = thread.likes.some(
          (likeId) => likeId.toString() === req.user.id
        );
        formattedThread.isOwner = thread.author._id.toString() === req.user.id;
      }

      return formattedThread;
    });

    res.status(200).json({
      success: true,
      count: formattedThreads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads: formattedThreads,
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({
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

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // Check if user exists
    const user = await User.findById(userId).select('username profilePic rollNumber department batch');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get total count (ONLY PUBLIC threads)
    const total = await Thread.countDocuments({
      author: userId,
      isAnonymous: false,
      isDeleted: false,
    });

    // Fetch ONLY public threads (isAnonymous: false)
    const threads = await Thread.find({
      author: userId,
      isAnonymous: false,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format threads
    const formattedThreads = threads.map((thread) => ({
      id: thread._id,
      content: thread.content,
      isAnonymous: false,
      images: thread.images,
      likes: thread.likes,
      likesCount: thread.likes.length,
      commentCount: thread.commentCount,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      author: {
        id: user._id,
        username: user.username,
        profilePic: user.profilePic,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
      },
      isLiked: req.user ? thread.likes.some((likeId) => likeId.toString() === req.user.id) : false,
      isOwner: req.user ? user._id.toString() === req.user.id : false,
    }));

    res.status(200).json({
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
    res.status(500).json({
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

// @desc    Get personalized feed (from followed users)
// @route   GET /api/threads/feed/following
// @access  Private
exports.getFollowingFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get current user's following list
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

    // Get total count
    const total = await Thread.countDocuments({
      author: { $in: user.following },
      isDeleted: false,
    });

    // Fetch threads from followed users
    const threads = await Thread.find({
      author: { $in: user.following },
      isDeleted: false,
    })
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format threads
    const formattedThreads = threads.map((thread) => {
      const formattedThread = {
        id: thread._id,
        content: thread.content,
        isAnonymous: thread.isAnonymous,
        images: thread.images,
        likes: thread.likes,
        likesCount: thread.likes.length,
        commentCount: thread.commentCount,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };

      if (!thread.isAnonymous && thread.author) {
        formattedThread.author = {
          id: thread.author._id,
          username: thread.author.username,
          profilePic: thread.author.profilePic,
          rollNumber: thread.author.rollNumber,
          department: thread.author.department,
          batch: thread.author.batch,
        };
      } else {
        formattedThread.author = {
          username: 'Anonymous',
          profilePic: '',
          department: 'COMSATS Student',
        };
      }

      formattedThread.isLiked = thread.likes.some(
        (likeId) => likeId.toString() === req.user.id
      );
      formattedThread.isOwner = thread.author._id.toString() === req.user.id;

      return formattedThread;
    });

    res.status(200).json({
      success: true,
      count: formattedThreads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads: formattedThreads,
    });
  } catch (error) {
    console.error('Get following feed error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching feed',
      error: error.message,
    });
  }
};