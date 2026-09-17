// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TP_VehicleAdvPawn.h"
#include "TP_VehicleAdvSportsCar.generated.h"

/**
 *  Sports car wheeled vehicle implementation
 */
UCLASS(abstract)
class TP_VEHICLEADV_API ATP_VehicleAdvSportsCar : public ATP_VehicleAdvPawn
{
	GENERATED_BODY()
	
public:

	ATP_VehicleAdvSportsCar();
};
