package com.chatmeter.domain.accounts

import com.chatmeter.datakit.util.MongoDoc

import ai.x.play.json.Encoders.encoder
import ai.x.play.json.Jsonx
import java.time.YearMonth
import org.bson.types.ObjectId
import play.api.libs.json.Json
import play.api.libs.json.Json.WithDefaultValues

/** * This case class is a DAO for an account's export data for a particular month. This gets aggregated into the
  * account and billing account exports.
  *
  * Warning, these are actually persisted. Therefore, all new values must be defaulted.
  */
case class AccountExport(
  _id: Option[ObjectId] = None,
  monthOfRecord: YearMonth = YearMonth.now(),
  billingAccountId: String,
  billingAccountName: String,
  accountName: String,
  accountId: String,
  accountType: Option[String],
  dateRemoved: Option[String],
  totalLocations: Int = 0,
  locationHQ: Int = 0,
  audits: Int = 0,
  instantAudits: Int = 0,
  cmSubscrFiveLocSubType: Int = 0,
  otherLocSubType: Int = 0,
  socialPublishing: Int = 0,
  socialEngagement: Int = 0,
  socialCommenting: Int = 0,
  yelpApi: Int = 0,
  chatExec: Int = 0,
  adviceLocalListingManagement: Int = 0,
  yelpPremiumListingManagement: Int = 0,
  yelpMecLocations: Int = 0,
  reportsBasic: Int = 0,
  reportsPlus: Int = 0,
  reportsPremium: Int = 0,
  localPages: Int = 0,
  revGenEmails: Int = 0,
  revGenSms: Int = 0,
  revGenReviews: Int = 0,
  sendiblePublishing: Int = 0
)

object AccountExport {
  def emptyNow: AccountExport = AccountExport(
    _id = None,
    monthOfRecord = YearMonth.now(),
    billingAccountId = "",
    billingAccountName = "",
    accountName = "",
    accountId = "",
    accountType = None,
    dateRemoved = None
  )
  implicit val oidFormat = MongoDoc.Formats.oidFormat
  implicit val ymFormat = MongoDoc.Formats.yearMonthFormat
  implicit val format = Jsonx.formatCaseClassUseDefaults[AccountExport]
}
