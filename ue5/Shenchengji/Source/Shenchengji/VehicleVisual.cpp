#include "VehicleVisual.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"

int32 FShenchengjiVehicleVisual::AttachImportedCar(APawn* Vehicle)
{
	if (!Vehicle)
	{
		return 0;
	}

	static const TCHAR* Parts[] = {
		TEXT("car_paint"), TEXT("car_glass"), TEXT("car_glass1"), TEXT("car_chrome"), TEXT("car_chrome1"),
		TEXT("car_trim"), TEXT("car_trim1"), TEXT("car_leather"), TEXT("car_leather1"), TEXT("car_caliper"),
		TEXT("car_caliper1"), TEXT("car_led"), TEXT("car_redled"), TEXT("car_amberled"), TEXT("car_darkalloy"),
		TEXT("wheel_lf_alloy"), TEXT("wheel_lf_darkalloy"), TEXT("wheel_lf_rubber"),
		TEXT("wheel_rf_alloy"), TEXT("wheel_rf_darkalloy"), TEXT("wheel_rf_rubber"),
		TEXT("wheel_lr_alloy"), TEXT("wheel_lr_darkalloy"), TEXT("wheel_lr_rubber"),
		TEXT("wheel_rr_alloy"), TEXT("wheel_rr_darkalloy"), TEXT("wheel_rr_rubber"),
		TEXT("brake_lf_caliper"), TEXT("brake_lf_darkalloy"), TEXT("brake_rf_caliper"), TEXT("brake_rf_darkalloy"),
	};

	int32 Loaded = 0;
	for (const TCHAR* Name : Parts)
	{
		const FString Path = FString::Printf(TEXT("/Game/Imported/Car/%s.%s"), Name, Name);
		UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
		if (!Mesh)
		{
			continue;
		}
		UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(Vehicle, Name);
		Component->SetStaticMesh(Mesh);
		Component->SetupAttachment(Vehicle->GetRootComponent());
		Component->SetRelativeRotation(FRotator(0.f, -90.f, 0.f));
		Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Component->RegisterComponent();
		++Loaded;
	}

	if (Loaded > 0)
	{
		TArray<USkeletalMeshComponent*> Skeletals;
		Vehicle->GetComponents<USkeletalMeshComponent>(Skeletals);
		for (USkeletalMeshComponent* Mesh : Skeletals)
		{
			Mesh->SetHiddenInGame(true);
		}
	}

	UE_LOG(LogTemp, Display, TEXT("深城纪已挂上导入车身 %d 件"), Loaded);
	return Loaded;
}
