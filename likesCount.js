db.threads.updateMany(
  { likesCount: { $exists: false } },
  [{ $set: { likesCount: { $size: { $ifNull: ['$likes', []] } } } }]
)