import mongoose from "mongoose";
import CreditTransaction from "../models/CreditTransaction.js";
import getUserById from "../utils/getUserById.js";

// allocate credits
export async function allocateCredits(req, res) {
  try {
    const { performerObjId, targetUserObjId, amount } = req.body;

    if (!performerObjId || !targetUserObjId || !amount || amount <= 0) {
      return res
        .status(400)
        .json({ error: "performer, targetUser, amount are required." });
    }

    const performerObjectId = new mongoose.Types.ObjectId(performerObjId);
    const targetUserObjectId = new mongoose.Types.ObjectId(targetUserObjId);

    const performer = await getUserById(performerObjectId);
    const targetUser = await getUserById(targetUserObjectId);

    if (!performer || !targetUser) {
      return res.status(404).json({ error: "Sender or recipient not found." });
    }

    // Ensure sender has enough credits to allocate
    if (performer.credits < amount) {
      return res
        .status(400)
        .json({ error: "Sender does not have enough credits." });
    }

    // Create a credit transaction
    await CreditTransaction.create({
      performer: {
        userObjId: performer._id,
        role: performer.role,
        previousBalance: performer.credits,
        updatedBalance: performer.credits - amount,
      },
      targetUser: {
        userObjId: targetUser._id,
        role: targetUser.role,
        previousBalance: targetUser.credits,
        updatedBalance: targetUser.credits + amount,
      },
      intendedAmount: targetUser.credits + amount,
      actualAmount: amount,
      type: "allocation",
      description: `Allocated ${amount} new credits from ${performer.name} to ${targetUser.name}`,
    });

    // Add credits to the recipient
    targetUser.credits += amount;
    targetUser.creditExpiry = performer.creditExpiry;
    await targetUser.save();

    // Subtract credits from the sender
    performer.credits -= amount;
    await performer.save();

    res.status(200).json({
      success: true,
      message: `${amount} credits allocated from ${performer.name} to ${targetUser.name}`,
      senderCredits: performer.credits,
      recipientCredits: targetUser.credits,
      expiryDate: targetUser.creditExpiry,
    });
  } catch (err) {
    console.error("Allocation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// sync credits
export async function syncCredits(req, res) {
  try {
    const { targetUserId, updatedCredit, performedBy } = req.body;

    if (
      !targetUserId ||
      updatedCredit == null ||
      !performedBy?.userObjId ||
      !performedBy?.role
    ) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const targetUser = await getUserById(targetUserId);
    const performer = await getUserById(performedBy.userObjId);

    if (!targetUser || !performer) {
      return res
        .status(404)
        .json({ error: "Target or performer user not found." });
    }

    const oldCredit = targetUser.credits;
    const difference = updatedCredit - oldCredit;

    // If increasing credit
    if (difference > 0) {
      if (performer.credits < difference) {
        return res
          .status(400)
          .json({ error: "Not enough credits to allocate." });
      }

      await CreditTransaction.create({
        performer: {
          userObjId: performer._id,
          role: performer.role,
          previousBalance: performer.credits,
          updatedBalance: performer.credits - difference,
        },
        targetUser: {
          userObjId: targetUser._id,
          role: targetUser.role,
          previousBalance: targetUser.credits,
          updatedBalance: targetUser.credits + difference,
        },
        intendedAmount: updatedCredit,
        actualAmount: difference,
        type: "allocation",
        description: `Allocated ${difference} credits from ${performer.name} to ${targetUser.name}`,
      });

      performer.credits -= difference;
      targetUser.credits += difference;
    }

    // If decreasing credit
    else if (difference < 0) {
      const toReclaim = Math.abs(difference);

      if (targetUser.credits < toReclaim) {
        return res
          .status(400)
          .json({ error: "Target does not have enough credits to reclaim." });
      }

      await CreditTransaction.create({
        performer: {
          userObjId: performer._id,
          role: performer.role,
          previousBalance: performer.credits,
          updatedBalance: performer.credits + toReclaim,
        },
        targetUser: {
          userObjId: targetUser._id,
          role: targetUser.role,
          previousBalance: targetUser.credits,
          updatedBalance: targetUser.credits - toReclaim,
        },
        intendedAmount: updatedCredit,
        actualAmount: toReclaim,
        type: "reclaim",
        description: `Reclaimed ${toReclaim} credits from ${targetUser.name} to ${performer.name}`,
      });

      targetUser.credits -= toReclaim;
      performer.credits += toReclaim;
    }

    // If no change
    else {
      return res.status(200).json({ message: "No credit update needed." });
    }

    // Set expiry same as performer’s creditExpiry
    targetUser.creditExpiry = performer.creditExpiry;

    await targetUser.save();
    await performer.save();

    res.status(200).json({
      success: true,
      message: "Credits updated successfully",
      targetUserBalance: targetUser.credits,
      performerBalance: performer.credits,
    });
  } catch (err) {
    console.error("Credit sync error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// get credit info
export async function getCreditsInfo(req, res) {
  try {
    const { userObjId } = req.query;

    if (!userObjId) {
      return res.status(400).json({ error: "userObjId is required" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userObjId);
    const user = await getUserById(userObjectId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentCredits = user.credits || 0;
    const creditExpiry = user.creditExpiry || null;

    // Fetch all transactions where admin is the sender
    const transactionsFrom = await CreditTransaction.find({
      "performer.userObjId": user._id,
    });
    const transactionsTo = await CreditTransaction.find({
      "targetUser.userObjId": user._id,
    });

    // Separate totals based on type
    const totalAllocated = transactionsFrom
      .filter((tx) => tx.type === "allocation")
      .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

    const totalUsed = transactionsFrom
      .filter((tx) => tx.type === "use")
      .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

    const totalIssued = transactionsTo
      .filter(
        (tx) =>
          tx.type === "issue" ||
          tx.type === "allocation" ||
          tx.type === "reclaim",
      )
      .reduce((sum, tx) => {
        const amount = tx.actualAmount || 0;
        return tx.type === "reclaim" ? sum - amount : sum + amount;
      }, 0);

    const totalReclaimed = transactionsFrom
      .filter((tx) => tx.type === "reclaim")
      .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

    res.status(200).json({
      success: true,
      userObjectId: user._id,
      currentCredits,
      totalUsed,
      totalAllocated,
      totalIssued,
      totalReclaimed,
      creditExpiry,
    });
  } catch (err) {
    console.error("Error fetching credit info:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// function to get transaction info
export async function getTransactionsInfo(req, res) {
  try {
    const { userObjId } = req.query;

    if (!userObjId) {
      return res
        .status(400)
        .json({ success: false, message: "userObjId is required" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userObjId);

    const transactions = await CreditTransaction.find({
      $or: [
        { "performer.userObjId": userObjectId },
        { "targetUser.userObjId": userObjectId },
      ],
    }).sort({ createdAt: -1 });

    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        const txObj = tx.toObject();

        if (
          txObj?.performer?.userObjId &&
          txObj?.performer?.userObjId !== "system"
        ) {
          try {
            const fullUser = await getUserById(txObj.performer.userObjId);

            if (fullUser) {
              // Convert Mongoose document to plain object
              const plainUser = fullUser.toObject
                ? fullUser.toObject()
                : fullUser;
              delete plainUser.password;

              txObj.performer = {
                ...txObj.performer,
                ...plainUser,
              };
            }
          } catch (err) {
            console.warn(
              `Failed to fetch performer for transaction ${tx._id}:`,
              err.message,
            );
          }
        }

        if (txObj?.targetUser?.userObjId) {
          try {
            const fullUser = await getUserById(txObj.targetUser.userObjId);

            if (fullUser) {
              // Convert Mongoose document to plain object
              const plainUser = fullUser.toObject
                ? fullUser.toObject()
                : fullUser;
              delete plainUser.password;

              txObj.targetUser = {
                ...txObj.targetUser,
                ...plainUser,
              };
            }
          } catch (err) {
            console.warn(
              `Failed to fetch target user for transaction ${tx._id}:`,
              err.message,
            );
          }
        }

        return txObj;
      }),
    );

    res.status(200).json({
      success: true,
      count: enrichedTransactions.length,
      transactions: enrichedTransactions,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// function to get the updated transaction info for an user just after update
export async function getUpdatedTransactionDetails(req, res) {
  const { userObjId } = req.query;

  const user = await getUserById(userObjId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const currentCredits = user.credits || 0;
  const creditExpiry = user.creditExpiry || null;

  const transactionsFrom = await CreditTransaction.find({
    "performer.userObjId": user._id,
  });

  const transactionsTo = await CreditTransaction.find({
    "targetUser.userObjId": user._id,
  });

  const totalAllocated = transactionsTo
    .filter((tx) => tx.type === "allocation")
    .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

  const totalUsed = transactionsFrom
    .filter((tx) => tx.type === "use")
    .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

  const totalReclaimed = transactionsTo
    .filter((tx) => tx.type === "reclaim")
    .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

  // Convert user to object and exclude password
  const userObj = user.toObject();
  delete userObj.password;

  // Merge calculated fields
  const enrichedUser = {
    ...userObj,
    credits: currentCredits,
    creditExpiry,
    allocated: totalAllocated,
    used: totalUsed,
    reclaimed: totalReclaimed,
  };

  return res.json({ user: enrichedUser });
}
