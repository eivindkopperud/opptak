enum MembershipType {
	leader = 'leader',
	deputy_leader = 'deputy_leader',
	cashier = 'cashier',
	board_member = 'board_member',
	deputy_board_member = 'deputy_board_member',
	volunteer = 'volunteer',
	member = 'member',
}

enum StatusTypes {
	PENDING = 'Pending',
	INVITED_TO_INTERVIEW = 'Invited to interview',
	INTERVIEW_DECLINED = 'Interview declined',
	INTERVIEW_COMPLETED = 'Interview completed',
	OFFER_GIVEN = 'Offer given',
	OFFER_DECLINED = 'Offer declined',
	ACCEPTED = 'Accepted',
	REJECTED = 'Rejected',
}

enum SortTypes {
	NAME_ASC = 'name_asc',
	NAME_DESC = 'name_desc',
	DATE_ASC = 'date_asc',
	DATE_DESC = 'date_desc',
}

export { StatusTypes, MembershipType, SortTypes }
