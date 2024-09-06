import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  if (!query || !query.trim() === "") {
    throw new ApiError(400, "Query is required");
  }

  const videos = await Video.aggregate([
    {
      $match: {
        $or: [
          {
            title: { $regex: query, $options: "i" },
          },
          {
            description: { $regex: query, $options: "i" },
          },
        ],
      },
    },

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
      $project: {
        videoFile: 1,
        thumbnail: 1,
        owner: 1,
        _id: 1,
        title: 1,
        description: 1,
        views: 1,
        duration: 1,
        isPublished: 1,
      },
    },

    {
      $sort: {
        [sortBy]: sortType === "asc" ? 1 : -1,
      },
    },

    {
      $skip: (page - 1) * limit,
    },

    {
      $limit: parseInt(limit),
    },
  ]);

  if (!videos.length) {
    throw new ApiError(404, "no videos found from given query");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if ([title, description].some((fields) => fields?.trim() === "")) {
    throw new ApiError(400, "Title and description are required");
  }

  try {
    const videoFileLocalPath = req.files?.videoFile[0]?.path;

    const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

    if (!videoFileLocalPath) {
      throw new ApiError(401, "Video file local path is required");
    }

    if (!thumbnailLocalPath) {
      throw new ApiError(401, "Thumbnail file local path is required");
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath);

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!videoFile.url) {
      throw new ApiError(400, "Video file is required");
    }

    if (!thumbnail.url) {
      throw new ApiError(400, "Thumbnail file is required");
    }

    const video = await Video.create({
      title,
      description,
      thumbnail: thumbnail.url,
      videoFile: videoFile.url,
      thumbnail_public_id: thumbnail.public_id,
      videoFile_public_id: videoFile.public_id,
      duration: videoFile.duration,
      owner: req.user?._id,
    });

    if (!video) {
      throw new ApiError(500, "Error while uploading the Video");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, video, "Video successfully uploaded to database")
      );
  } catch (error) {
    throw new ApiError(400, "Error while uploading the video", error);
  }
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Video id is not valid");
  }

  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
      },
    },

    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      },
    },

    {
      $addFields: {
        likesCount: {
          $size: "$likes",
        },

        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false,
          },
        },
      },
    },

    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "owner",
        as: "owner",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              foreignField: "channel",
              localField: "_id",
              as: "subscribers",
            },
          },

          {
            $addFields: {
              subscriberCount: {
                $size: "$subscribers",
              },

              isSubscribed: {
                $cond: {
                  if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                  then: true,
                  else: false,
                },
              },
            },
          },

          {
            $project: {
              fullName: 1,
              username: 1,
              avatar: 1,
              subscriberCount: 1,
              isSubscribed: 1,
            },
          },
        ],
      },
    },

    {
      $lookup: {
        from: "comments",
        foreignField: "video",
        localField: "_id",
        as: "comments",
      },
    },

    {
      $project: {
        videoFile: 1,
        thumbnail: 1,
        title: 1,
        description: 1,
        duration: 1,
        views: 1,
        owner: 1,
        createdAt: 1,
        comments: 1,
        likesCount: 1,
        isLiked: 1,
      },
    },
  ]);

  if (!video) {
    throw new ApiError(404, "Video is not found");
  }

  const videoViews = await Video.findByIdAndUpdate(
    videoId,
    {
      $inc: { views: 1 },
    },

    {
      new: true,
    }
  );

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $addToSet: { watchHistory: videoId },
    },

    {
      new: true,
    }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        video: video[0],
        videoViews: videoViews,
        user: user,
      },

      "Video fetched successfully"
    )
  );
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Valid video id is required");
  }

  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(401, "title and description is required");
  }

  const newThumbnailLocalPath = req.file?.path;

  if (!newThumbnailLocalPath) {
    throw new ApiError(401, "Thumbnail file path is required");
  }

  const thumbnail = await uploadOnCloudinary(newThumbnailLocalPath);

  if (!thumbnail.url) {
    throw new ApiError(500, "Error while uploading to cloudinary");
  }

  const oldThumbnail = await Video.findById(videoId);

  const oldThumbnail_public_id = oldThumbnail.thumbnail_public_id;

  const video = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        title: title,
        description: description,
        thumbnail: thumbnail.url,
        thumbnail_public_id: thumbnail.public_id,
      },
    },
    {
      new: true,
    }
  );

  await deleteFromCloudinary(oldThumbnail_public_id)
    .then((res) => {
      console.log("Deletion response:", response);
      return new ApiResponse(200, {}, "Old file has been deleted");
    })
    .catch((error) => {
      console.error("Deletion failed:", error);
      throw new ApiError(400, "error deleting the old file from cloudinary");
    });

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video has been successfully updated"));
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "valid video id is required.");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(401, "Video not found");
  }

  const videoFile_public_id = video.videoFile_public_id;
  const thumbnail_public_id = video.thumbnail_public_id;
  const ownerId = video.owner;

  const deletedVideo = await Video.findByIdAndDelete(videoId);

  if (!deletedVideo) {
    throw new ApiError(500, "Error while deleting the video");
  }

  await Comment.deleteMany({ video: videoId });

  await Like.deleteMany({ video: videoId });

  await User.updateMany(
    { watchHistory: videoId },
    { $pull: { watchHistory: videoId } }
  );

  await User.findByIdAndUpdate(
    ownerId,
    {
      $pull: { video: videoId },
    },

    {
      new: true,
    }
  );

  const deleteVideoFile = await deleteFromCloudinary(videoFile_public_id)
    .then((response) => {
      console.log("Deletion response:", response);
    })
    .catch((error) => {
      console.error("Deletion failed:", error);
    });

  const deleteThumbnail = await deleteFromCloudinary(thumbnail_public_id)
    .then((response) => {
      console.log("Deletion response:", response);
    })
    .catch((error) => {
      console.error("Deletion failed:", error);
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { deletedVideo, deleteThumbnail, deleteVideoFile },
        "Video successfully deleted from database"
      )
    );
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Video id is not valid");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  const toggleStatus = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        isPublished: !video.isPublished,
      },
    },
    {
      new: true,
    }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, toggleStatus, "Status is updated successfully"));
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
