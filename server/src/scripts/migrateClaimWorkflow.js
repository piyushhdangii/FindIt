import 'dotenv/config'
import Claim from '../models/Claim.js'
import Report from '../models/Report.js'
import { connectDatabase, disconnectDatabase } from '../config/db.js'

async function migrateClaimWorkflow() {
  await connectDatabase()
  try {
    const duplicates = await Claim.aggregate([
      { $group: { _id: { report: '$report', claimant: '$claimant' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    if (duplicates.length) {
      throw new Error(`Found ${duplicates.length} report/claimant pair(s) with multiple claim records. Review and resolve these duplicates without deleting claim history, then rerun the migration; no claim data was changed.`)
    }

    await Claim.createIndexes()
    const indexes = await Claim.collection.indexes()
    const obsoletePartialIndex = indexes.find((index) =>
      index.name !== '_id_'
      && index.key?.report === 1
      && index.key?.claimant === 1
      && index.unique
      && index.partialFilterExpression?.active === true)
    if (obsoletePartialIndex) await Claim.collection.dropIndex(obsoletePartialIndex.name)

    const completedClaims = await Claim.find({ status: 'completed' }).select('report')
    for (const claim of completedClaims) {
      await Report.updateOne(
        {
          _id: claim.report,
          status: { $in: ['open', 'matched', 'recovered'] },
          $or: [{ returnedClaim: { $exists: false } }, { returnedClaim: null }],
        },
        { $set: { status: 'recovered', returnedClaim: claim._id } },
      )
    }

    await Promise.all([
      Claim.updateMany({ status: 'approved' }, { $set: { status: 'accepted', active: true } }),
      Claim.updateMany({ status: { $in: ['pending', 'under_discussion', 'accepted', 'return_arranged', 'disputed'] } }, { $set: { active: true } }),
      Claim.updateMany({ status: 'completed' }, { $set: { status: 'returned', active: false } }),
      Claim.updateMany({ status: { $in: ['rejected', 'returned', 'cancelled'] } }, { $set: { active: false } }),
    ])
    console.log(`Migrated ${completedClaims.length} legacy completed claim(s); claim statuses and one-claim-per-person/report uniqueness are normalized.`)
  } finally {
    await disconnectDatabase()
  }
}

migrateClaimWorkflow().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
