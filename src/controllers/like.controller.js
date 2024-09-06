import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";
import { Tweet } from "../models/tweet.model.js";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user?._id;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  // check if the video exist
  try {
    const video = await Video.findById(videoId);

    if (!video) {
      throw new ApiError(404, "video not found");
    }

    // Check if the user already liked the video

    const isLiked = await Like.findOne({
      video: videoId,
      likedBy: userId,
    });

    if (isLiked) {
      // If the like exists, remove it (unlike the video)
      const unLiked = await Like.findByIdAndDelete(isLiked._id);

      return res
        .status(200)
        .json(new ApiResponse(200, unLiked, "video Unliked"));
    } else {
      // If no like exists, create a new one (like the video)
      const liked = await Like.create({
        video: videoId,
        likedBy: userId,
      });

      return res.status(200).json(new ApiResponse(200, liked, "video liked"));
    }
  } catch (error) {
    throw new ApiError(500, "Error while toggling like");
  }
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }

  const userId = req.user?._id;
  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  const isLiked = await Like.findOne({
    comment: commentId,
    likedBy: userId,
  });

  if (isLiked) {
    const unliked = await Like.findByIdAndDelete(isLiked._id);
    if (!unliked) {
      throw new ApiError(500, "Error while unliking the comment");
    }
  } else {
    const liked = await Like.create({
      comment: commentId,
      likedBy: userId,
    });

    if (!liked) {
      throw new ApiError(500, "Error while liking the comment");
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Successfully updated liked status"));
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid tweet Id");
  }

  const tweet = await Tweet.findById(tweetId);

  if (!tweet) {
    throw new ApiError(500, "Tweet not found");
  }

  const userId = req.user?._id;

  const isLiked = await Like.findOne({
    tweet: tweetId,
    likedBy: userId,
  });

  if (isLiked) {
    const unliked = await Like.findByIdAndDelete(isLiked._id);
    if (!unliked) {
      throw new ApiError(500, "Error while unliking the tweet");
    }
  } else {
    const liked = await Like.create({
      tweet: tweetId,
      likedBy: userId,
    });

    if (!liked) {
      throw new ApiError(500, "Error while liking the tweet");
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Successfully updated the like status"));
});

const getLikedVideos = asyncHandler(async (req, res) => {
  const likedVideos = await Like.aggregate([
    {
      $match: {
        likedBy: new mongoose.Types.ObjectId(req.user?._id),
      },
    },

    {
      $lookup: {
        from: "videos",
        foreignField: "_id",
        localField: "video",
        as: "video",
        pipeline: [
          {
            $lookup: {
              from: "users",
              foreignField: "_id",
              localField: "owner",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    avatar: 1,
                    username: 1,
                    fullName: 1,
                  },
                },
              ],
            },
          },

          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },

    {
      $addFields: {
        video: {
          $first: "$video",
        },
      },
    },

    {
      $match: {
        video: {
          $first: { $exists: true },
        },
      },
    },
  ]);

  if (!likedVideos?.length) {
    throw new ApiError(500, "No liked videos found for this user");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, likedVideos, "Liked videos fetched successfully")
    );
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };
